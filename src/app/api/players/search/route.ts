import { NextRequest, NextResponse } from 'next/server';

interface Player {
  PlayerID: number;
  Team?: string | null;
  Number?: number | null;
  FirstName: string;
  LastName: string;
  Position: string;
  Status?: string;
  Height?: string;
  Weight?: number;
  BirthDate?: string;
  College?: string;
  Experience?: number;
  FantasyPosition?: string;
  Active?: boolean;
  PositionCategory?: string;
  Name: string;
  Age?: number;
  ShortName?: string;
  TeamID?: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const team = searchParams.get('team') || '';
    const sport = searchParams.get('sport') || 'nfl';

    const apiKey = process.env.PLAYER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'PLAYER_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Map sport to SportsData.io API path
    const sportMap: Record<string, string> = {
      nfl: 'nfl',
      nba: 'nba',
      mlb: 'mlb',
      nhl: 'nhl',
      ncaaf: 'ncaaf',
      ncaab: 'ncaab',
    };

    const sportPath = sportMap[sport.toLowerCase()] || 'nfl';
    let players: Player[] = [];

    try {
      // Try to get players by team first if team is provided
      if (team) {
        // Handle multiple teams (comma-separated)
        const teamNames = team.split(',').map(t => t.trim()).filter(t => t);
        
        // Try to get all active players and filter by team
        const teamUrl = `https://api.sportsdata.io/v3/${sportPath}/scores/json/Players?key=${apiKey}`;
        const response = await fetch(teamUrl, {
          next: { revalidate: 3600 }, // Cache for 1 hour
        });

        if (response.ok) {
          const allPlayers = await response.json();
          if (Array.isArray(allPlayers)) {
            // Filter by team name (case-insensitive partial match)
            // Handle team name variations (e.g., "Kansas City Chiefs" vs "KC")
            players = allPlayers.filter((p: Player) => {
              if (!p.Team) return false;
              const playerTeam = p.Team.toLowerCase();
              // Check if player's team matches any of the provided teams
              return teamNames.some(teamName => {
                const teamLower = teamName.toLowerCase();
                return playerTeam.includes(teamLower) || teamLower.includes(playerTeam);
              });
            });
          }
        }
      }

      // If no team filter or no results, try free agents or all players
      if (players.length === 0) {
        const freeAgentsUrl = `https://api.sportsdata.io/v3/${sportPath}/scores/json/PlayersByFreeAgents?key=${apiKey}`;
        const response = await fetch(freeAgentsUrl, {
          next: { revalidate: 3600 },
        });

        if (response.ok) {
          const freeAgents = await response.json();
          if (Array.isArray(freeAgents)) {
            players = freeAgents;
          }
        }
      }

      // If still no results, try the main Players endpoint
      if (players.length === 0) {
        const allPlayersUrl = `https://api.sportsdata.io/v3/${sportPath}/scores/json/Players?key=${apiKey}`;
        const response = await fetch(allPlayersUrl, {
          next: { revalidate: 3600 },
        });

        if (response.ok) {
          const allPlayers = await response.json();
          if (Array.isArray(allPlayers)) {
            players = allPlayers;
          }
        }
      }

      // Filter by search query if provided
      if (query) {
        const queryLower = query.toLowerCase().trim();
        players = players.filter((player: Player) => 
          player.Name?.toLowerCase().includes(queryLower) ||
          player.FirstName?.toLowerCase().includes(queryLower) ||
          player.LastName?.toLowerCase().includes(queryLower) ||
          player.Position?.toLowerCase().includes(queryLower) ||
          (player.Team && player.Team.toLowerCase().includes(queryLower))
        );
      }

      // Filter to active players only (if available)
      players = players.filter((player: Player) => 
        player.Active !== false && player.Status !== 'Inactive'
      );

      // Sort by name
      players.sort((a, b) => {
        const nameA = a.Name || `${a.FirstName} ${a.LastName}`;
        const nameB = b.Name || `${b.FirstName} ${b.LastName}`;
        return nameA.localeCompare(nameB);
      });

      // Limit results to 100
      players = players.slice(0, 100);

      // Transform to our format
      const formattedPlayers = players.map((player: Player) => ({
        id: player.PlayerID,
        name: player.Name || `${player.FirstName} ${player.LastName}`,
        firstName: player.FirstName,
        lastName: player.LastName,
        position: player.Position,
        team: player.Team || null,
        number: player.Number,
        status: player.Status,
        active: player.Active,
        experience: player.Experience,
        height: player.Height,
        weight: player.Weight,
        college: player.College,
      }));

      return NextResponse.json({
        players: formattedPlayers,
        total: formattedPlayers.length,
      });
    } catch (error) {
      console.error('Error fetching players from SportsData.io:', error);
      // Return empty results instead of error
      return NextResponse.json({
        players: [],
        total: 0,
      });
    }
  } catch (error) {
    console.error('Error searching players:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

