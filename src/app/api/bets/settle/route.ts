import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Bet, IBet } from '@/models/Bet';
import { User } from '@/models/User';
import { Log } from '@/models/Log';
import { updateUserStats } from '@/lib/stats';
import { notifyBetSettled } from '@/lib/betNotifications';

export const runtime = 'nodejs';

// Map The Odds API sport_key to SportsData.io format
function mapSportKeyToSportsData(sportKey: string): string {
  const map: Record<string, string> = {
    'americanfootball_nfl': 'nfl',
    'americanfootball_ncaaf': 'ncaaf',
    'basketball_nba': 'nba',
    'basketball_ncaab': 'ncaab',
    'baseball_mlb': 'mlb',
    'icehockey_nhl': 'nhl',
  };
  return map[sportKey] || sportKey.split('_').pop() || 'nfl';
}

// Get game score from The Odds API
async function getGameScore(providerEventId: string, sportKey: string): Promise<{
  completed: boolean;
  homeScore?: number;
  awayScore?: number;
} | null> {
  try {
    const apiKey = process.env.ODD_API_KEY;
    if (!apiKey) {
      console.error('ODD_API_KEY not configured');
      return null;
    }

    // Get scores for the sport (up to 3 days back - API limit)
    // Note: The Odds API rejects higher values with INVALID_SCORES_DAYS_FROM
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?daysFrom=3&apiKey=${apiKey}`;
    const response = await fetch(url, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      console.error(`Failed to fetch scores for ${sportKey}:`, response.statusText);
      return null;
    }

    const games = await response.json();
    if (!Array.isArray(games)) {
      return null;
    }

    // Find the game by ID
    const game = games.find((g: { id: string }) => g.id === providerEventId);
    if (!game) {
      // Game not found - might be older than 30 days or not in API results
      console.warn(`Game not found in API results for providerEventId: ${providerEventId}, sportKey: ${sportKey}`);
      return null;
    }

    if (!game.completed) {
      return { completed: false };
    }

    // Extract scores
    let homeScore: number | undefined;
    let awayScore: number | undefined;

    if (game.scores && Array.isArray(game.scores)) {
      for (const score of game.scores) {
        const scoreName = (score.name || '').trim();
        const homeTeam = (game.home_team || '').trim();
        const awayTeam = (game.away_team || '').trim();
        
        // Match by exact name or partial match
        if (scoreName === homeTeam || homeTeam.includes(scoreName) || scoreName.includes(homeTeam)) {
          const parsed = parseInt(score.score, 10);
          if (!isNaN(parsed)) {
            homeScore = parsed;
          }
        }
        if (scoreName === awayTeam || awayTeam.includes(scoreName) || scoreName.includes(awayTeam)) {
          const parsed = parseInt(score.score, 10);
          if (!isNaN(parsed)) {
            awayScore = parsed;
          }
        }
      }
    }
    
    // If scores not found in array, try direct properties (some APIs return scores differently)
    if (homeScore === undefined && game.home_score !== undefined) {
      const parsed = parseInt(String(game.home_score), 10);
      if (!isNaN(parsed)) homeScore = parsed;
    }
    if (awayScore === undefined && game.away_score !== undefined) {
      const parsed = parseInt(String(game.away_score), 10);
      if (!isNaN(parsed)) awayScore = parsed;
    }

    // Validate that we have both scores (log warning if incomplete)
    if (homeScore === undefined || awayScore === undefined) {
      console.warn(`Incomplete score data for game ${providerEventId}: homeScore=${homeScore}, awayScore=${awayScore}`);
    }
    
    return {
      completed: true,
      homeScore,
      awayScore,
    };
  } catch (error) {
    console.error('Error fetching game score:', error);
    return null;
  }
}

// Get player stats from SportsData.io
async function getPlayerStats(
  playerId: number,
  sport: string,
  gameDate: Date,
  _providerEventId?: string
): Promise<Record<string, number> | null> {
  try {
    const apiKey = process.env.PLAYER_API_KEY;
    if (!apiKey) {
      console.error('PLAYER_API_KEY not configured');
      return null;
    }

    const sportPath = sport.toLowerCase();
    const year = gameDate.getFullYear();
    const month = gameDate.getMonth() + 1;
    const day = gameDate.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // For NFL, we need season and week
    if (sportPath === 'nfl') {
      // Calculate season (NFL season starts in September)
      const season = month >= 9 ? year : year - 1;
      
      // Calculate week (simplified - NFL week 1 typically starts in early September)
      const seasonStart = new Date(season, 8, 1); // September 1
      const daysDiff = Math.floor((gameDate.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24));
      const week = Math.max(1, Math.min(18, Math.floor(daysDiff / 7) + 1));

      const url = `https://api.sportsdata.io/v3/${sportPath}/stats/json/PlayerGameStatsByPlayerID/${season}/${week}/${playerId}?key=${apiKey}`;
      const response = await fetch(url, {
        next: { revalidate: 3600 },
      });

      if (response.ok) {
        const stats = await response.json();
        
        // API might return an array of games or a single object
        if (Array.isArray(stats)) {
          // Find the game that matches the date
          const gameStats = stats.find((game: { GameDate?: string; Date?: string }) => {
            const gameDateStr = game.GameDate || game.Date;
            if (!gameDateStr) return false;
            // Compare dates (ignore time)
            return gameDateStr.startsWith(dateStr);
          });
          
          if (gameStats && typeof gameStats === 'object') {
            return gameStats as Record<string, number>;
          }
        } else if (stats && typeof stats === 'object') {
          // Single game stats object
          return stats as Record<string, number>;
        }
      } else {
        console.warn(`Failed to fetch NFL player stats: ${response.status} ${response.statusText}`);
      }
    } else if (sportPath === 'nba' || sportPath === 'mlb') {
      // For NBA/MLB, use PlayerPropsByPlayerID endpoint
      // This API returns an array of prop objects with Description and StatResult
      try {
        const url = `https://api.sportsdata.io/v3/${sportPath}/odds/json/PlayerPropsByPlayerID/${dateStr}/${playerId}?key=${apiKey}`;
        const response = await fetch(url, {
          next: { revalidate: 3600 },
        });

        if (response.ok) {
          const props = await response.json();
          
          // The API returns an array of prop objects
          if (Array.isArray(props)) {
            // Verify it's for the correct player and date
            const validProps = props.filter((prop: { PlayerID?: number; DateTime?: string }) => {
              if (prop.PlayerID !== playerId) return false;
              if (prop.DateTime) {
                const propDate = prop.DateTime.split('T')[0]; // Extract date part
                return propDate === dateStr;
              }
              return true;
            });
            
            if (validProps.length > 0) {
              // Return as a special structure that includes the Description field
              return { _playerPropsArray: validProps } as unknown as Record<string, number>;
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch ${sportPath.toUpperCase()} player props:`, error);
      }
    } else {
      // For NHL and other sports - try PlayerGameStatsByDate endpoint first
      // This endpoint returns all player stats for a specific date
      try {
        const url = `https://api.sportsdata.io/v3/${sportPath}/stats/json/PlayerGameStatsByDate/${dateStr}?key=${apiKey}`;
        const response = await fetch(url, {
          next: { revalidate: 3600 },
        });

        if (response.ok) {
          const allPlayerStats = await response.json();
          
          if (Array.isArray(allPlayerStats)) {
            // Find stats for this specific player
            const playerStats = allPlayerStats.find((stat: { PlayerID?: number }) => 
              stat.PlayerID === playerId
            );
            
            if (playerStats && typeof playerStats === 'object') {
              return playerStats as Record<string, number>;
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch player stats by date for ${sportPath}:`, error);
      }
      
      // Fallback: Try PlayerGameStatsByPlayerID with date (if supported)
      try {
        const url = `https://api.sportsdata.io/v3/${sportPath}/stats/json/PlayerGameStatsByPlayerID/${dateStr}/${playerId}?key=${apiKey}`;
        const response = await fetch(url, {
          next: { revalidate: 3600 },
        });

        if (response.ok) {
          const stats = await response.json();
          
          if (Array.isArray(stats)) {
            // Find the game that matches the date
            const gameStats = stats.find((game: { GameDate?: string; Date?: string }) => {
              const gameDateStr = game.GameDate || game.Date;
              return gameDateStr && gameDateStr.startsWith(dateStr);
            });
            
            if (gameStats && typeof gameStats === 'object') {
              return gameStats as Record<string, number>;
            }
          } else if (stats && typeof stats === 'object') {
            return stats as Record<string, number>;
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch player stats by player ID for ${sportPath}:`, error);
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return null;
  }
}

// Map prop type to SportsData.io stat field name
function mapPropTypeToStatField(statType: string, sport: string): string | null {
  const sportLower = sport.toLowerCase();
  
  // NFL stat mappings
  if (sportLower === 'nfl' || sportLower.includes('football')) {
    const nflMap: Record<string, string> = {
      'Passing Yards': 'PassingYards',
      'Passing TDs': 'PassingTouchdowns',
      'Interceptions Thrown': 'PassingInterceptions',
      'Rushing Yards': 'RushingYards',
      'Rushing Attempts': 'RushingAttempts',
      'Receiving Yards': 'ReceivingYards',
      'Receptions': 'Receptions',
      'Anytime TD Scorer': 'Touchdowns', // Total TDs (rushing + receiving)
      'Longest Reception': 'ReceivingLong',
      'Longest Rush': 'RushingLong',
    };
    return nflMap[statType] || null;
  }
  
  // NBA stat mappings
  if (sportLower === 'nba' || sportLower.includes('basketball')) {
    const nbaMap: Record<string, string> = {
      'Points': 'Points',
      'Rebounds': 'Rebounds',
      'Assists': 'Assists',
      'Points + Rebounds + Assists (PRA)': 'PRA', // Need to calculate
      'PRA': 'PRA', // Need to calculate
      '3-Pointers Made': 'ThreePointersMade',
      'Steals': 'Steals',
      'Blocks': 'BlockedShots',
      'Turnovers': 'Turnovers',
    };
    return nbaMap[statType] || null;
  }
  
  // MLB stat mappings
  if (sportLower === 'mlb' || sportLower.includes('baseball')) {
    const mlbMap: Record<string, string> = {
      'Hits': 'Hits',
      'Home Runs': 'HomeRuns',
      'RBIs': 'RunsBattedIn',
      'Runs': 'Runs',
      'Total Bases': 'TotalBases',
      'Stolen Bases': 'StolenBases',
      'Pitcher Strikeouts': 'PitchingStrikeouts',
      'Pitcher Outs Recorded': 'PitchingOuts',
      'Walks Drawn': 'Walks',
    };
    return mlbMap[statType] || null;
  }
  
  // NHL stat mappings
  if (sportLower === 'nhl' || sportLower.includes('hockey')) {
    const nhlMap: Record<string, string> = {
      'Goals': 'Goals',
      'Assists': 'Assists',
      'Points': 'Points',
      'Shots on Goal': 'ShotsOnGoal',
      'Blocked Shots': 'BlockedShots',
      'Goalie Saves': 'Saves',
    };
    return nhlMap[statType] || null;
  }
  
  return null;
}

// Settle a bet based on game results
async function settleBet(bet: IBet): Promise<'win' | 'loss' | 'push' | 'void' | 'pending'> {
  // Handle parlay bets - check all legs
  if (bet.marketType === 'Parlay') {
    const parlayId = typeof bet._id === 'string' ? bet._id : bet._id?.toString?.();
    if (!parlayId) {
      return 'void';
    }

    // Find all legs of this parlay
    const legs = await Bet.find({ parlayId }).lean();
    
    if (legs.length === 0) {
      // No legs found - invalid parlay
      return 'void';
    }

    // Check if all legs are settled
    const allLegsSettled = legs.every(leg => leg.result !== 'pending');
    
    if (!allLegsSettled) {
      // Not all legs are settled yet
      return 'pending';
    }

    // All legs are settled - determine parlay result
    // Standard parlay rules:
    // - If ANY leg is a loss → parlay loses
    // - If ANY leg is void → parlay is void
    // - If ALL legs are wins → parlay wins
    // - Push legs: Typically, a push reduces the parlay (e.g., 3-leg parlay with 1 push becomes 2-leg parlay)
    //   For simplicity, we'll treat push as void (parlay becomes void)
    
    const hasLoss = legs.some(leg => leg.result === 'loss');
    const hasVoid = legs.some(leg => leg.result === 'void');
    const hasPush = legs.some(leg => leg.result === 'push');
    const allWins = legs.every(leg => leg.result === 'win');

    if (hasLoss) {
      return 'loss'; // Any loss = parlay loses
    }
    
    if (hasVoid || hasPush) {
      return 'void'; // Any void or push = parlay is void
    }
    
    if (allWins) {
      return 'win'; // All wins = parlay wins
    }

    // Should not reach here, but return void as fallback
    return 'void';
  }
  
  if (!bet.providerEventId || !bet.sport) {
    return 'void';
  }

  // Get sport key from bet (should be stored when bet is created)
  const sportKey = (bet as unknown as { sportKey?: string }).sportKey || bet.sport.toLowerCase();
  
  // Map sport key to SportsData.io format
  const sportPath = mapSportKeyToSportsData(sportKey);
  
  // For Player Props, we need player stats
  if (bet.marketType === 'Player Prop') {
    const playerId = (bet as unknown as { playerId?: number }).playerId;
    
    if (!playerId || !bet.statType || !bet.line || !bet.overUnder) {
      return 'void';
    }

    // Get player stats
    const playerStats = await getPlayerStats(
      playerId,
      sportPath,
      new Date(bet.startTime),
      bet.providerEventId
    );

    if (!playerStats) {
      return 'pending'; // Stats not available yet
    }

    // For NBA/MLB, the API returns player props array structure
    if ((sportPath === 'nba' || sportPath === 'mlb') && (playerStats as unknown as { _playerPropsArray?: unknown })._playerPropsArray) {
      const propsArray = (playerStats as unknown as { 
        _playerPropsArray: Array<{ 
          Description: string; 
          StatResult: number | null; 
          OverUnder: number;
        }> 
      })._playerPropsArray;
      
      // Map bet statType to API Description field
      // API returns: Points, Rebounds, Assists, Steals, Three Pointers Made, 
      // Points + Rebounds + Assists, Points + Rebounds, Points + Assists, etc.
      const descriptionMap: Record<string, string> = {
        'Points': 'Points',
        'Rebounds': 'Rebounds',
        'Assists': 'Assists',
        'Points + Rebounds + Assists (PRA)': 'Points + Rebounds + Assists',
        'PRA': 'Points + Rebounds + Assists', // NCAA Basketball uses 'PRA'
        '3-Pointers Made': 'Three Pointers Made',
        'Steals': 'Steals',
        'Blocks': 'Blocks', // Note: May not be in all API responses
        'Turnovers': 'Turnovers', // Note: May not be in all API responses
        // MLB mappings
        'Hits': 'Hits',
        'Home Runs': 'Home Runs',
        'RBIs': 'RBIs',
        'Runs': 'Runs',
        'Total Bases': 'Total Bases',
        'Stolen Bases': 'Stolen Bases',
        'Pitcher Strikeouts': 'Pitcher Strikeouts',
        'Pitcher Outs Recorded': 'Pitcher Outs Recorded',
        'Walks Drawn': 'Walks Drawn',
      };
      
      const apiDescription = descriptionMap[bet.statType] || bet.statType;
      const prop = propsArray.find(p => p.Description === apiDescription);
      
      if (!prop) {
        console.warn(`Stat type "${bet.statType}" not found in player props for player ${playerId}`);
        return 'void';
      }
      
      // StatResult is null if the game hasn't been settled yet
      if (prop.StatResult === null || prop.StatResult === undefined) {
        return 'pending';
      }
      
      const actualStat = prop.StatResult;
      const line = bet.line;
      
      if (bet.overUnder === 'Over') {
        if (actualStat > line) return 'win';
        if (actualStat < line) return 'loss';
        return 'push';
      } else if (bet.overUnder === 'Under') {
        if (actualStat < line) return 'win';
        if (actualStat > line) return 'loss';
        return 'push';
      }
      
      return 'void';
    }

    // For other sports (NFL, CFB, CBB, NHL), use the standard stat field mapping
    const statField = mapPropTypeToStatField(bet.statType, sportPath);
    if (!statField) {
      console.warn(`Unknown stat type: ${bet.statType} for sport: ${sportPath}`);
      return 'void';
    }

    // Get the actual stat value
    let statValue: number | undefined;

    // Handle special cases
    if (statField === 'PRA' || statField === 'Points + Rebounds + Assists (PRA)') {
      // Calculate PRA (Points + Rebounds + Assists)
      statValue = (playerStats.Points || 0) + (playerStats.Rebounds || 0) + (playerStats.Assists || 0);
    } else if (statField === 'Touchdowns' && bet.statType === 'Anytime TD Scorer') {
      // Anytime TD Scorer: check if player scored any TD
      const rushingTDs = playerStats.RushingTouchdowns || 0;
      const receivingTDs = playerStats.ReceivingTouchdowns || 0;
      const passingTDs = playerStats.PassingTouchdowns || 0;
      statValue = rushingTDs + receivingTDs + passingTDs > 0 ? 1 : 0;
    } else {
      statValue = playerStats[statField] as number | undefined;
    }

    if (statValue === undefined) {
      return 'void';
    }

    // Settle based on Over/Under
    const line = bet.line;
    if (bet.overUnder === 'Over') {
      return statValue > line ? 'win' : statValue < line ? 'loss' : 'push';
    } else if (bet.overUnder === 'Under') {
      return statValue < line ? 'win' : statValue > line ? 'loss' : 'push';
    }

    return 'void';
  }

  // For team-based bets (ML, Spread, Total), use game scores
  const gameScore = await getGameScore(bet.providerEventId, sportKey);
  
  if (!gameScore || !gameScore.completed) {
    return 'pending';
  }

  if (gameScore.homeScore === undefined || gameScore.awayScore === undefined) {
    return 'void';
  }

  const homeScore = gameScore.homeScore;
  const awayScore = gameScore.awayScore;

  // Settle based on market type
  switch (bet.marketType) {
    case 'ML': {
      // Moneyline: which team won
      const homeWon = homeScore > awayScore;
      const awayWon = awayScore > homeScore;
      
      if (bet.selection === bet.homeTeam && homeWon) return 'win';
      if (bet.selection === bet.awayTeam && awayWon) return 'win';
      if (bet.selection === bet.homeTeam && awayWon) return 'loss';
      if (bet.selection === bet.awayTeam && homeWon) return 'loss';
      if (homeScore === awayScore) return 'push';
      return 'void';
    }

    case 'Spread': {
      // Spread: team must win by more than the line (or lose by less than the line)
      // If line is -7.5, team must win by more than 7.5 points
      // If line is +7.5, team can lose by up to 7.5 points (or win)
      const line = bet.line || 0;
      let pointDifference: number;

      if (bet.selection === bet.homeTeam) {
        // Home team spread: homeScore - awayScore
        pointDifference = homeScore - awayScore;
      } else if (bet.selection === bet.awayTeam) {
        // Away team spread: awayScore - homeScore
        pointDifference = awayScore - homeScore;
      } else {
        return 'void';
      }

      // Compare point difference to the line
      // If line is negative (e.g., -7.5), team is favored and must win by more than |line|
      // If line is positive (e.g., +7.5), team is underdog and can lose by up to |line|
      if (pointDifference > line) return 'win';
      if (pointDifference < line) return 'loss';
      return 'push'; // Exact match (rare but possible)
    }

    case 'Total': {
      // Total: over/under combined score
      const totalScore = homeScore + awayScore;
      const line = bet.line || 0;
      const overUnder = bet.overUnder;

      if (overUnder === 'Over' && totalScore > line) return 'win';
      if (overUnder === 'Over' && totalScore < line) return 'loss';
      if (overUnder === 'Under' && totalScore < line) return 'win';
      if (overUnder === 'Under' && totalScore > line) return 'loss';
      if (totalScore === line) return 'push';
      return 'void';
    }

    default:
      return 'void';
  }
}

/**
 * POST /api/bets/settle
 * Auto-settle bets based on game scores and player stats
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { betId } = body;

    if (!betId) {
      return NextResponse.json({ error: 'betId is required' }, { status: 400 });
    }

    // Find bet
    const bet = await Bet.findById(betId);
    if (!bet) {
      return NextResponse.json({ error: 'Bet not found' }, { status: 404 });
    }

    // Only settle pending bets
    if (bet.result !== 'pending') {
      return NextResponse.json({ 
        bet,
        message: 'Bet already settled',
      });
    }

    // Check if event has started
    const now = new Date();
    const startTime = new Date(bet.startTime);
    
    if (now < startTime) {
      return NextResponse.json({
        bet,
        message: 'Event has not started yet',
      });
    }

    // Auto-settle the bet
    const result = await settleBet(bet as unknown as IBet);
    
    if (result === 'pending') {
      return NextResponse.json({
        bet,
        message: 'Game not completed yet',
      });
    }

    // Update bet result
    bet.result = result;
    await bet.save();

    // If this is a parlay leg, check if the parent parlay should be settled
    if (bet.parlayId) {
      try {
        const parlayBet = await Bet.findById(bet.parlayId);
        if (parlayBet && parlayBet.result === 'pending') {
          // Try to settle the parlay
          const parlayResult = await settleBet(parlayBet as unknown as IBet);
          if (parlayResult !== 'pending') {
            parlayBet.result = parlayResult;
            await parlayBet.save();

            // Log parlay settlement
            await Log.create({
              userId: parlayBet.userId,
              betId: parlayBet._id,
              action: 'bet_auto_settled',
              metadata: { result: parlayResult, triggeredBy: 'leg_settlement' },
            });

            // Notify parlay settlement
            const parlayUser = await User.findById(parlayBet.userId);
            await notifyBetSettled(parlayBet as unknown as IBet, parlayResult, parlayUser ?? undefined);

            // Recalculate stats for parlay user
            if (parlayUser) {
              const allParlayBets = await Bet.find({ userId: parlayBet.userId }).lean();
              await updateUserStats(parlayBet.userId.toString(), allParlayBets as unknown as IBet[]);
            }
          }
        }
      } catch (error) {
        console.error('Error settling parent parlay:', error);
        // Don't fail the leg settlement if parlay check fails
      }
    }

    // Recalculate user stats
    const user = await User.findById(bet.userId);
    if (user) {
      const allBets = await Bet.find({ userId: bet.userId }).lean();
      await updateUserStats(bet.userId.toString(), allBets as unknown as IBet[]);
    }

    // Log the action
    await Log.create({
      userId: bet.userId,
      betId: bet._id,
      action: 'bet_auto_settled',
      metadata: { result },
    });

    const userForNotification = user ?? await User.findById(bet.userId);
    if (!bet.parlayId) {
      await notifyBetSettled(bet as unknown as IBet, result, userForNotification ?? undefined);
    }

    return NextResponse.json({
      bet,
      message: 'Bet auto-settled successfully',
    });
  } catch (error) {
    console.error('Error auto-settling bet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/bets/settle
 * Auto-settle all pending bets that have completed games
 * Note: This endpoint is kept for backward compatibility.
 * For new implementations, use POST /api/bets/settle-all
 */
export async function PUT() {
  try {
    await connectDB();

    // Find all pending bets where the event has started
    const now = new Date();
    const pendingBets = await Bet.find({
      result: 'pending',
      startTime: { $lte: now },
      providerEventId: { $exists: true, $ne: null },
    });

    const results = {
      settled: 0,
      pending: 0,
      errors: 0,
    };

    for (const bet of pendingBets) {
      try {
        const result = await settleBet(bet as unknown as IBet);
        
        if (result !== 'pending') {
          bet.result = result;
          await bet.save();

          // Log the action
          await Log.create({
            userId: bet.userId,
            betId: bet._id,
            action: 'bet_auto_settled',
            metadata: { result },
          });

          results.settled++;
        } else {
          results.pending++;
        }
      } catch (error) {
        console.error(`Error settling bet ${bet._id}:`, error);
        results.errors++;
      }
    }

    // Recalculate stats for all affected users
    const affectedUserIds = [...new Set(pendingBets.map(b => b.userId.toString()))];
    for (const userId of affectedUserIds) {
      try {
        const allBets = await Bet.find({ userId }).lean();
        await updateUserStats(userId, allBets as unknown as IBet[]);
      } catch (error) {
        console.error(`Error updating stats for user ${userId}:`, error);
      }
    }

    return NextResponse.json({
      message: 'Auto-settlement completed',
      results,
    });
  } catch (error) {
    console.error('Error auto-settling bets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

