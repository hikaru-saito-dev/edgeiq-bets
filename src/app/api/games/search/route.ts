import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Removed unused constants and functions

/**
 * Fetch available sports from The Odds API
 */
async function getAvailableSports(apiKey: string): Promise<Array<{ key: string; title: string; group: string; description?: string; active: boolean; has_outrights: boolean }>> {
  try {
    const response = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.error('Failed to fetch sports:', response.statusText);
      return [];
    }

    const sports = await response.json();
    return Array.isArray(sports) ? sports : [];
  } catch (error) {
    console.error('Error fetching sports:', error);
    return [];
  }
}

/**
 * GET /api/games/search
 * Search for games/events using The Odds API
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const sport = searchParams.get('sport') || '';
    const league = searchParams.get('league') || '';

    const apiKey = process.env.ODD_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ODD_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Get available sports from API
    const availableSports = await getAvailableSports(apiKey);
    
    // Filter to only active sports without outrights (we want games, not futures)
    // Show ALL games from The Odds API (filtering by SportsData.io support happens on frontend)
    const activeSports = availableSports.filter(s => 
      s.active && 
      !s.has_outrights
    );

    // Smart sport filtering based on query
    let sportsToSearch: string[] = [];
    
    if (sport) {
      // Specific sport requested
      sportsToSearch = [sport];
    } else if (query) {
      // Try to detect sport/league from query
      const lowerQuery = query.toLowerCase().trim();
      
      // Match query against sport titles, groups, and keys
      const matchedSports = activeSports.filter(s => 
        s.title.toLowerCase().includes(lowerQuery) ||
        s.group.toLowerCase().includes(lowerQuery) ||
        s.key.toLowerCase().includes(lowerQuery) ||
        (s.description && s.description.toLowerCase().includes(lowerQuery))
      );
      
      if (matchedSports.length > 0) {
        // If query matches a sport, only search those sports
        sportsToSearch = matchedSports.map(s => s.key);
      } else {
        // Query doesn't match a sport, search all sports (will filter by team name later)
        sportsToSearch = activeSports.map(s => s.key);
      }
    } else {
      // No query, search all active sports
      sportsToSearch = activeSports.map(s => s.key);
    }

    const allGames: Array<{
      provider: string;
      providerEventId: string;
      sport: string;
      league: string;
      sportKey?: string; // The Odds API sport_key (e.g., "americanfootball_nfl")
      homeTeam: string;
      awayTeam: string;
      homeTeamId?: string;
      awayTeamId?: string;
      startTime: string;
    }> = [];

    // Fetch games from each sport
    for (const sportKey of sportsToSearch) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads&oddsFormat=american`;
        const response = await fetch(url, {
          next: { revalidate: 60 }, // Cache for 60 seconds
        });

        if (!response.ok) {
          console.error(`Failed to fetch ${sportKey}:`, response.statusText);
          continue;
        }

        const data = await response.json();
        
        // Transform The Odds API response to our format
        if (Array.isArray(data)) {
          // Find sport info for display name
          const sportInfo = availableSports.find(s => s.key === sportKey);
          const sportDisplayName = sportInfo?.title || sportKey;
          const sportGroup = sportInfo?.group || '';
          
          for (const event of data) {
            allGames.push({
              provider: 'TheOddsAPI',
              providerEventId: event.id,
              sport: sportGroup || sportDisplayName,
              league: sportDisplayName,
              sportKey: event.sport_key || sportKey, // Include sport_key from The Odds API
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              homeTeamId: event.home_team,
              awayTeamId: event.away_team,
              startTime: event.commence_time,
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching ${sportKey}:`, error);
        continue;
      }
    }

    // Filter games based on query
    let filteredGames = allGames;
    if (query) {
      const lowerQuery = query.toLowerCase().trim();
      filteredGames = filteredGames.filter(game => 
        game.homeTeam.toLowerCase().includes(lowerQuery) ||
        game.awayTeam.toLowerCase().includes(lowerQuery) ||
        game.league.toLowerCase().includes(lowerQuery) ||
        game.sport.toLowerCase().includes(lowerQuery)
      );
    }
    if (league) {
      filteredGames = filteredGames.filter(game => 
        game.league.toLowerCase() === league.toLowerCase()
      );
    }

    // Sort by start time (upcoming games first)
    filteredGames.sort((a, b) => {
      const timeA = new Date(a.startTime).getTime();
      const timeB = new Date(b.startTime).getTime();
      return timeA - timeB;
    });

    return NextResponse.json({
      games: filteredGames,
      total: filteredGames.length,
    });
  } catch (error) {
    console.error('Error searching games:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

