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

interface Team {
  Key: string;
  TeamID: number;
  City: string;
  Name: string;
  FullName: string;
  Conference?: string;
  Division?: string;
}

// Fetch teams from TeamsBasic endpoint and find team key by FullName
async function getTeamKey(teamName: string, sport: string, apiKey: string): Promise<string | null> {
  try {
    const sportPath = sport.toLowerCase();
    const teamsUrl = `https://api.sportsdata.io/v3/${sportPath}/scores/json/TeamsBasic?key=${apiKey}`;
    const res = await fetch(teamsUrl, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!res.ok) {
      console.error(`Failed to fetch teams for ${sportPath}:`, res.statusText);
      return null;
    }

    const teams: Team[] = await res.json();

    if (!Array.isArray(teams)) {
      return null;
    }

    // Find by FullName (case-insensitive)
    const team = teams.find(t => t.FullName.toLowerCase() === teamName.toLowerCase());

    if (team) {
      return team.Key;
    }

    // Fallback: try partial match on FullName
    const lowerTeamName = teamName.toLowerCase();
    const matchedTeam = teams.find(t => 
      t.FullName.toLowerCase().includes(lowerTeamName) || 
      lowerTeamName.includes(t.FullName.toLowerCase())
    );

    if (matchedTeam) {
      return matchedTeam.Key;
    }

    // Fallback: try matching by City + Name
    const teamWords = lowerTeamName.split(/\s+/);
    if (teamWords.length >= 2) {
      const city = teamWords.slice(0, -1).join(' ');
      const name = teamWords[teamWords.length - 1];
      
      const matchedTeam2 = teams.find(t => 
        t.City.toLowerCase() === city && 
        t.Name.toLowerCase() === name
      );

      if (matchedTeam2) {
        return matchedTeam2.Key;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching team key for ${teamName}:`, error);
    return null;
  }
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
      // If team is provided, use the PlayersBasic endpoint for each team
      if (team) {
        const teamNames = team.split(',').map(t => t.trim()).filter(t => t);
        
        // Fetch team keys for all teams in parallel
        const teamKeyPromises = teamNames.map(teamName => getTeamKey(teamName, sportPath, apiKey));
        const teamKeys = await Promise.all(teamKeyPromises);

        // Fetch players for each team using the team key
        for (let i = 0; i < teamNames.length; i++) {
          const teamName = teamNames[i];
          const teamKey = teamKeys[i];

          if (teamKey) {
            try {
              // Use the PlayersBasic endpoint: /PlayersBasic/{TEAM_KEY}
              const teamUrl = `https://api.sportsdata.io/v3/${sportPath}/scores/json/PlayersBasic/${teamKey}?key=${apiKey}`;
              const response = await fetch(teamUrl, {
                next: { revalidate: 3600 }, // Cache for 1 hour
              });

              if (response.ok) {
                const teamPlayers = await response.json();
                if (Array.isArray(teamPlayers)) {
                  players = [...players, ...teamPlayers];
                }
              } else {
                console.warn(`Failed to fetch players for team ${teamKey} (${teamName}): ${response.status} ${response.statusText}`);
              }
            } catch (error) {
              console.error(`Error fetching players for team ${teamKey} (${teamName}):`, error);
              // Continue to next team
            }
          } else {
            console.warn(`Could not find team key for: "${teamName}" in sport: ${sportPath}`);
            // Fallback: try to search all players and filter by team name
            try {
              const allPlayersUrl = `https://api.sportsdata.io/v3/${sportPath}/scores/json/Players?key=${apiKey}`;
              const response = await fetch(allPlayersUrl, {
                next: { revalidate: 3600 },
              });

              if (response.ok) {
                const allPlayers = await response.json();
                if (Array.isArray(allPlayers)) {
                  // Filter by team name (case-insensitive partial match)
                  const teamLower = teamName.toLowerCase();
                  const filtered = allPlayers.filter((p: Player) => {
                    if (!p.Team) return false;
                    const playerTeam = p.Team.toLowerCase();
                    return playerTeam.includes(teamLower) || teamLower.includes(playerTeam);
                  });
                  players = [...players, ...filtered];
                }
              }
            } catch (error) {
              console.error(`Error in fallback search for team ${teamName}:`, error);
            }
          }
        }
      }

      // If no team filter or no results, try searching all players
      if (players.length === 0 && !team) {
        // If there's a search query, try to search all players
        if (query) {
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
      }

      // Filter by search query if provided
      if (query && players.length > 0) {
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

      // Remove duplicates by PlayerID
      const uniquePlayers = new Map<number, Player>();
      for (const player of players) {
        if (!uniquePlayers.has(player.PlayerID)) {
          uniquePlayers.set(player.PlayerID, player);
        }
      }
      players = Array.from(uniquePlayers.values());

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
