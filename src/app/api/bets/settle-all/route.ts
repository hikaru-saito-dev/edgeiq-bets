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
    'americanfootball_ncaaf': 'cfb', // College Football
    'basketball_nba': 'nba',
    'basketball_ncaab': 'cbb', // College Basketball
    'basketball_ncaaw': 'cwbb', // College Women's Basketball
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
    
    // If scores not found in array, try direct properties
    if (homeScore === undefined && game.home_score !== undefined) {
      const parsed = parseInt(String(game.home_score), 10);
      if (!isNaN(parsed)) homeScore = parsed;
    }
    if (awayScore === undefined && game.away_score !== undefined) {
      const parsed = parseInt(String(game.away_score), 10);
      if (!isNaN(parsed)) awayScore = parsed;
    }

    // Validate that we have both scores
    if (homeScore === undefined || awayScore === undefined) {
      console.warn(`Incomplete score data for game ${providerEventId}: homeScore=${homeScore}, awayScore=${awayScore}`);
      return {
        completed: true,
        homeScore,
        awayScore,
      };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getFirstWeekdayUtc(year: number, month: number, weekday: number): Date {
  const date = new Date(Date.UTC(year, month, 1));
  const currentWeekday = date.getUTCDay();
  const diff = (weekday - currentWeekday + 7) % 7;
  date.setUTCDate(1 + diff);
  return date;
}

function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function weeksBetween(start: Date, end: Date): number {
  const msPerWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.floor((end.getTime() - start.getTime()) / msPerWeek);
}

function getNFLSeasonInfo(gameDate: Date): { season: number; seasonType: 'PRE' | 'REG' | 'POST'; week: number } {
  const date = new Date(gameDate);
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();

  // Preseason games occur in August
  if (month === 7) {
    const season = year;
    const preseasonStart = getFirstWeekdayUtc(season, 7, 4); // First Thursday in August
    const weeks = weeksBetween(preseasonStart, date);
    return {
      season,
      seasonType: 'PRE',
      week: clamp(weeks + 1, 1, 4),
    };
  }

  // Regular season runs roughly September (month 8) through December (11)
  if (month >= 8 && month <= 11) {
    const season = year;
    const laborDay = getFirstWeekdayUtc(season, 8, 1); // First Monday in September
    const seasonStart = addDaysUtc(laborDay, 3); // Thursday after Labor Day
    const weeks = weeksBetween(seasonStart, date);
    return {
      season,
      seasonType: 'REG',
      week: clamp(weeks + 1, 1, 18),
    };
  }

  // Postseason games occur January/February of the following calendar year
  if (month <= 1) {
    const season = year - 1;
    const postseasonStart = getFirstWeekdayUtc(year, 0, 6); // First Saturday in January
    const weeks = weeksBetween(postseasonStart, date);
    return {
      season,
      seasonType: 'POST',
      week: clamp(weeks + 1, 1, 5),
    };
  }

  // Offseason (March-July) - treat as upcoming regular season for safety
  const fallbackSeason = month < 7 ? year - 1 : year;
  return {
    season: fallbackSeason,
    seasonType: 'REG',
    week: 1,
  };
}

// Get player stats from SportsData.io
async function getPlayerStats(
  playerId: number,
  sport: string,
  gameDate: Date,
  providerEventId?: string
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
      const { season, seasonType, week } = getNFLSeasonInfo(gameDate);
      const seasonSegment = `${season}${seasonType}`;

      const url = `https://api.sportsdata.io/v3/${sportPath}/stats/json/PlayerGameStatsByPlayerID/${seasonSegment}/${week}/${playerId}?key=${apiKey}`;
      const response = await fetch(url, {
        next: { revalidate: 3600 },
      });

      if (response.ok) {
        const stats = await response.json();
        
        if (Array.isArray(stats)) {
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
      } else {
        console.warn(`Failed to fetch NFL player stats: ${response.status} ${response.statusText}`);
      }
    } else {
      // For NBA, MLB, NHL - try PlayerGameStatsByDate endpoint
      try {
        const url = `https://api.sportsdata.io/v3/${sportPath}/stats/json/PlayerGameStatsByDate/${dateStr}?key=${apiKey}`;
        const response = await fetch(url, {
          next: { revalidate: 3600 },
        });

        if (response.ok) {
          const allPlayerStats = await response.json();
          
          if (Array.isArray(allPlayerStats)) {
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
  
  if (sportLower === 'nfl' || sportLower.includes('football')) {
    const nflMap: Record<string, string> = {
      'Passing Yards': 'PassingYards',
      'Passing TDs': 'PassingTouchdowns',
      'Interceptions Thrown': 'PassingInterceptions',
      'Rushing Yards': 'RushingYards',
      'Rushing Attempts': 'RushingAttempts',
      'Receiving Yards': 'ReceivingYards',
      'Receptions': 'Receptions',
      'Anytime TD Scorer': 'Touchdowns',
      'Longest Reception': 'ReceivingLong',
      'Longest Rush': 'RushingLong',
    };
    return nflMap[statType] || null;
  }
  
  if (sportLower === 'nba' || sportLower.includes('basketball')) {
    const nbaMap: Record<string, string> = {
      'Points': 'Points',
      'Rebounds': 'Rebounds',
      'Assists': 'Assists',
      'Points + Rebounds + Assists (PRA)': 'PRA',
      'PRA': 'PRA',
      '3-Pointers Made': 'ThreePointersMade',
      'Steals': 'Steals',
      'Blocks': 'BlockedShots',
      'Turnovers': 'Turnovers',
    };
    return nbaMap[statType] || null;
  }
  
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
  // Parlay bets require manual settlement as they involve multiple games/legs
  if (bet.marketType === 'Parlay') {
    return 'pending'; // Parlay bets cannot be auto-settled
  }
  
  if (!bet.providerEventId || !bet.sport) {
    return 'void';
  }

  const sportKey = (bet as unknown as { sportKey?: string }).sportKey || bet.sport.toLowerCase();
  const sportPath = mapSportKeyToSportsData(sportKey);
  
  // For Player Props, we need player stats
  if (bet.marketType === 'Player Prop') {
    const playerId = (bet as unknown as { playerId?: number }).playerId;
    
    if (!playerId || !bet.statType || !bet.line || !bet.overUnder) {
      return 'void';
    }

    const playerStats = await getPlayerStats(
      playerId,
      sportPath,
      new Date(bet.startTime),
      bet.providerEventId
    );

    if (!playerStats) {
      return 'pending';
    }

    const statField = mapPropTypeToStatField(bet.statType, sportPath);
    if (!statField) {
      console.warn(`Unknown stat type: ${bet.statType} for sport: ${sportPath}`);
      return 'void';
    }

    let statValue: number | undefined;

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
      const line = bet.line || 0;
      let pointDifference: number;

      if (bet.selection === bet.homeTeam) {
        pointDifference = homeScore - awayScore;
      } else if (bet.selection === bet.awayTeam) {
        pointDifference = awayScore - homeScore;
      } else {
        return 'void';
      }

      if (pointDifference > line) return 'win';
      if (pointDifference < line) return 'loss';
      return 'push';
    }

    case 'Total': {
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
 * POST /api/bets/settle-all
 * Auto-settle all pending bets that have completed games
 * This endpoint can be called by a cron job
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Optional: Add authentication/authorization for cron endpoint
    // For now, we'll allow it to be called (you may want to add a secret key check)

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
      details: [] as Array<{ betId: string; result: string; error?: string }>,
    };

    for (const bet of pendingBets) {
      try {
        const result = await settleBet(bet as unknown as IBet);
        
        if (result !== 'pending') {
          bet.result = result;
          await bet.save();

          await Log.create({
            userId: bet.userId,
            betId: bet._id,
            action: 'bet_auto_settled',
            metadata: { result },
          });

          const user = await User.findById(bet.userId);
          if (!bet.parlayId) {
            await notifyBetSettled(bet as unknown as IBet, result, user ?? undefined);
          }

          results.settled++;
          results.details.push({ betId: bet._id.toString(), result });
        } else {
          results.pending++;
        }
      } catch (error) {
        console.error(`Error settling bet ${bet._id}:`, error);
        results.errors++;
        results.details.push({ 
          betId: bet._id.toString(), 
          result: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
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

