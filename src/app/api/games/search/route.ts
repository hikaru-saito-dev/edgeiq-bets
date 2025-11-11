import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/games/search
 * Search for games/events from sports data providers
 * 
 * This is a placeholder endpoint. In production, you would integrate with:
 * - Sportradar API
 * - SportsDataIO API
 * - The Odds API
 * - API-SPORTS
 * 
 * For now, returns mock data to demonstrate the structure
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const sport = searchParams.get('sport') || '';
    const league = searchParams.get('league') || '';

    // TODO: Integrate with actual sports data provider API
    // Example integration would look like:
    // const apiKey = process.env.SPORTRADAR_API_KEY;
    // const response = await fetch(`https://api.sportradar.com/...`);
    // const data = await response.json();
    
    // Mock data structure for demonstration
    const mockGames = [
      {
        provider: 'Sportradar',
        providerEventId: 'sr:match:42198765',
        sport: 'Basketball',
        league: 'NBA',
        homeTeam: 'Los Angeles Lakers',
        awayTeam: 'Boston Celtics',
        homeTeamId: 'lal',
        awayTeamId: 'bos',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      },
      {
        provider: 'SportsDataIO',
        providerEventId: '1245893',
        sport: 'Football',
        league: 'NFL',
        homeTeam: 'Kansas City Chiefs',
        awayTeam: 'Buffalo Bills',
        homeTeamId: 'kc',
        awayTeamId: 'buf',
        startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // Day after tomorrow
      },
    ];

    // Filter mock data based on query
    let filteredGames = mockGames;
    if (query) {
      const lowerQuery = query.toLowerCase();
      filteredGames = mockGames.filter(game => 
        game.homeTeam.toLowerCase().includes(lowerQuery) ||
        game.awayTeam.toLowerCase().includes(lowerQuery) ||
        game.league.toLowerCase().includes(lowerQuery)
      );
    }
    if (sport) {
      filteredGames = filteredGames.filter(game => 
        game.sport.toLowerCase() === sport.toLowerCase()
      );
    }
    if (league) {
      filteredGames = filteredGames.filter(game => 
        game.league.toLowerCase() === league.toLowerCase()
      );
    }

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

