require('dotenv').config({ path: '.env.local' });

const providerEventId = '71f8ed63fc501e4cc1f41bf1374a132b';
const sportKey = 'icehockey_nhl';
const playerId = 30000259;
const playerName = 'Anthony Stolarz';
const statType = 'Assists';
const line = 2;
const overUnder = 'Over';
const gameDate = new Date('2025-11-14T00:08:21.000Z');

async function testNHLPlayerProp() {
  console.log('🔍 Testing NHL Player Prop Settlement');
  console.log('Game: Los Angeles Kings @ Toronto Maple Leafs');
  console.log('Provider Event ID:', providerEventId);
  console.log('Sport Key:', sportKey);
  console.log('Start Time:', gameDate.toISOString());
  console.log(`Player: ${playerName} (ID: ${playerId})`);
  console.log(`Prop: ${statType} ${overUnder} ${line}`);
  console.log('');

  // Step 1: Check game status from The Odds API
  console.log('📊 Step 1: Checking game status from The Odds API...');
  const oddApiKey = process.env.ODD_API_KEY;
  if (!oddApiKey) {
    console.error('❌ ODD_API_KEY not configured');
    return;
  }

  try {
    const scoresUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?daysFrom=3&apiKey=${oddApiKey}`;
    const scoresResponse = await fetch(scoresUrl);
    
    if (!scoresResponse.ok) {
      console.error(`❌ Failed to fetch scores: ${scoresResponse.status} ${scoresResponse.statusText}`);
      return;
    }

    const games = await scoresResponse.json();
    if (!Array.isArray(games)) {
      console.error('❌ Invalid response format from scores API');
      return;
    }

    const game = games.find((g) => g.id === providerEventId);
    if (!game) {
      console.log('⚠️  Game not found in The Odds API (might be older than 3 days or not in results)');
      console.log('Available games:', games.length);
      if (games.length > 0) {
        console.log('Sample game IDs:', games.slice(0, 3).map(g => g.id));
      }
    } else {
      console.log('✅ Game found in The Odds API');
      console.log('Game details:', {
        id: game.id,
        home_team: game.home_team,
        away_team: game.away_team,
        commence_time: game.commence_time,
        completed: game.completed,
        scores: game.scores,
        home_score: game.home_score,
        away_score: game.away_score,
      });
      console.log('');

      if (!game.completed) {
        console.log('⏳ Game is still in progress or not completed yet');
      } else {
        console.log('✅ Game is completed!');
        if (game.scores && Array.isArray(game.scores)) {
          console.log('Scores:', game.scores);
        }
        if (game.home_score !== undefined && game.away_score !== undefined) {
          console.log(`Final Score: ${game.away_team} ${game.away_score} - ${game.home_score} ${game.home_team}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error fetching game status:', error.message);
  }

  console.log('');

  // Step 2: Check player stats for player prop using NHL endpoint
  console.log('📊 Step 2: Checking player stats for player prop...');
  console.log(`Using NHL endpoint: PlayerPropsByPlayerID/{date}/{playerId}`);
  console.log('');

  const playerApiKey = process.env.PLAYER_API_KEY;
  if (!playerApiKey) {
    console.error('❌ PLAYER_API_KEY not configured');
    return;
  }

  try {
    // Convert UTC date to Eastern Time for API query
    function getEasternDateStr(date) {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        
        const parts = formatter.formatToParts(date);
        const year = parts.find(p => p.type === 'year')?.value || '';
        const month = parts.find(p => p.type === 'month')?.value || '';
        const day = parts.find(p => p.type === 'day')?.value || '';
        
        return `${year}-${month}-${day}`;
      } catch {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    
    const dateStr = getEasternDateStr(gameDate);
    console.log(`Game UTC time: ${gameDate.toISOString()}`);
    console.log(`Fetching stats for Eastern Time date: ${dateStr}`);
    
    // NHL uses PlayerPropsByPlayerID/{date}/{playerId} from /odds/json/
    const nhlUrl = `https://api.sportsdata.io/v3/nhl/odds/json/PlayerPropsByPlayerID/${dateStr}/${playerId}?key=${playerApiKey}`;
    console.log('NHL URL:', nhlUrl);
    console.log('');
    
    const statsResponse = await fetch(nhlUrl);
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      console.log('✅ Successfully fetched player props!');
      console.log('Response type:', Array.isArray(stats) ? 'Array' : typeof stats);
      console.log('');
      
      if (Array.isArray(stats)) {
        console.log(`Received ${stats.length} prop records`);
        
        // Find the stat for this player and date
        const playerStat = stats.find((stat) => {
          if (stat.PlayerID !== playerId) return false;
          const gameDateStr = stat.GameDate || stat.Date;
          return gameDateStr && gameDateStr.startsWith(dateStr);
        });
        
        if (playerStat) {
          console.log('✅ Player stat found!');
          console.log('Player stat object:', JSON.stringify(playerStat, null, 2));
          console.log('');
          
          // Check for Assists stat
          const assistsValue = playerStat.Assists;
          if (assistsValue !== undefined) {
            console.log(`📊 Settlement Test:`);
            console.log(`  Stat Value (Assists): ${assistsValue}`);
            console.log(`  Line: ${line}`);
            console.log(`  Over/Under: ${overUnder}`);
            
            let result;
            if (overUnder === 'Over') {
              result = assistsValue > line ? 'win' : assistsValue < line ? 'loss' : 'push';
            } else if (overUnder === 'Under') {
              result = assistsValue < line ? 'win' : assistsValue > line ? 'loss' : 'push';
            }
            
            console.log(`  Result: ${result.toUpperCase()}`);
            if (result === 'win') {
              console.log(`  ✅ Bet WINS! (${assistsValue} ${overUnder === 'Over' ? '>' : '<'} ${line})`);
            } else if (result === 'loss') {
              console.log(`  ❌ Bet LOSES (${assistsValue} ${overUnder === 'Over' ? '<=' : '>='} ${line})`);
            } else {
              console.log(`  ➖ Bet PUSHES (${assistsValue} === ${line})`);
            }
          } else {
            console.log('⚠️  Assists stat not found in response');
            console.log('Available stat fields:', Object.keys(playerStat).slice(0, 20));
          }
        } else {
          console.log(`⚠️  Player stat not found for PlayerID ${playerId} on date ${dateStr}`);
          if (stats.length > 0) {
            console.log('Sample stat record:', JSON.stringify(stats[0], null, 2));
          } else {
            // Try alternative endpoint when array is empty
            console.log('');
            console.log('Trying alternative endpoint: PlayerGameStatsByDate...');
            const altUrl = `https://api.sportsdata.io/v3/nhl/stats/json/PlayerGameStatsByDate/${dateStr}?key=${playerApiKey}`;
            console.log('Alternative URL:', altUrl);
            
            const altResponse = await fetch(altUrl);
            if (altResponse.ok) {
              const allPlayerStats = await altResponse.json();
              console.log('✅ Alternative endpoint worked!');
              console.log(`Received ${Array.isArray(allPlayerStats) ? allPlayerStats.length : 'non-array'} player stat records`);
              
              if (Array.isArray(allPlayerStats)) {
                const playerStats = allPlayerStats.find((stat) => stat.PlayerID === playerId);
                
                if (playerStats) {
                  console.log('✅ Player stats found!');
                  console.log('Player stats:', {
                    PlayerID: playerStats.PlayerID,
                    Name: playerStats.Name,
                    Team: playerStats.Team,
                    Opponent: playerStats.Opponent,
                    GameDate: playerStats.Day || playerStats.DateTime,
                    Assists: playerStats.Assists,
                    Goals: playerStats.Goals,
                    Points: playerStats.Points,
                  });
                  console.log('');
                  
                  // Test settlement
                  const assistsValue = playerStats.Assists;
                  if (assistsValue !== undefined) {
                    console.log(`📊 Settlement Test:`);
                    console.log(`  Stat Value (Assists): ${assistsValue}`);
                    console.log(`  Line: ${line}`);
                    console.log(`  Over/Under: ${overUnder}`);
                    
                    let result;
                    if (overUnder === 'Over') {
                      result = assistsValue > line ? 'win' : assistsValue < line ? 'loss' : 'push';
                    } else if (overUnder === 'Under') {
                      result = assistsValue < line ? 'win' : assistsValue > line ? 'loss' : 'push';
                    }
                    
                    console.log(`  Result: ${result.toUpperCase()}`);
                    if (result === 'win') {
                      console.log(`  ✅ Bet WINS! (${assistsValue} ${overUnder === 'Over' ? '>' : '<'} ${line})`);
                    } else if (result === 'loss') {
                      console.log(`  ❌ Bet LOSES (${assistsValue} ${overUnder === 'Over' ? '<=' : '>='} ${line})`);
                    } else {
                      console.log(`  ➖ Bet PUSHES (${assistsValue} === ${line})`);
                    }
                  }
                } else {
                  console.log(`⚠️  Player stats not found for PlayerID ${playerId}`);
                }
              }
            } else {
              console.log(`⚠️  Alternative endpoint also failed: ${altResponse.status}`);
            }
          }
        }
      } else if (stats && typeof stats === 'object') {
        console.log('✅ Received single stat object');
        console.log('Stat object:', JSON.stringify(stats, null, 2));
        console.log('');
        
        // Check if it's the right player and date
        const gameDateStr = stats.GameDate || stats.Date;
        if (gameDateStr && gameDateStr.startsWith(dateStr)) {
          const assistsValue = stats.Assists;
          if (assistsValue !== undefined) {
            console.log(`📊 Settlement Test:`);
            console.log(`  Stat Value (Assists): ${assistsValue}`);
            console.log(`  Line: ${line}`);
            console.log(`  Over/Under: ${overUnder}`);
            
            let result;
            if (overUnder === 'Over') {
              result = assistsValue > line ? 'win' : assistsValue < line ? 'loss' : 'push';
            } else if (overUnder === 'Under') {
              result = assistsValue < line ? 'win' : assistsValue > line ? 'loss' : 'push';
            }
            
            console.log(`  Result: ${result.toUpperCase()}`);
            if (result === 'win') {
              console.log(`  ✅ Bet WINS! (${assistsValue} ${overUnder === 'Over' ? '>' : '<'} ${line})`);
            } else if (result === 'loss') {
              console.log(`  ❌ Bet LOSES (${assistsValue} ${overUnder === 'Over' ? '<=' : '>='} ${line})`);
            } else {
              console.log(`  ➖ Bet PUSHES (${assistsValue} === ${line})`);
            }
          }
        } else {
          console.log('⚠️  Date mismatch or stat object structure different');
        }
      } else {
        console.log('⚠️  Unexpected response format');
        console.log('Response:', JSON.stringify(stats, null, 2));
      }
    } else {
      console.log(`⚠️  Failed to fetch NHL player props: ${statsResponse.status} ${statsResponse.statusText}`);
      const errorText = await statsResponse.text();
      console.log('Error response:', errorText.substring(0, 500));
      console.log('');
      
      // Try alternative: PlayerGameStatsByDate endpoint (using same Eastern Time date)
      console.log('Trying alternative endpoint: PlayerGameStatsByDate...');
      const altUrl = `https://api.sportsdata.io/v3/nhl/stats/json/PlayerGameStatsByDate/${dateStr}?key=${playerApiKey}`;
      console.log('Alternative URL:', altUrl);
      
      const altResponse = await fetch(altUrl);
      if (altResponse.ok) {
        const allPlayerStats = await altResponse.json();
        console.log('✅ Alternative endpoint worked!');
        console.log(`Received ${Array.isArray(allPlayerStats) ? allPlayerStats.length : 'non-array'} player stat records`);
        
        if (Array.isArray(allPlayerStats)) {
          const playerStats = allPlayerStats.find((stat) => stat.PlayerID === playerId);
          
          if (playerStats) {
            console.log('✅ Player stats found!');
            console.log('Player stats:', {
              PlayerID: playerStats.PlayerID,
              Name: playerStats.Name,
              Team: playerStats.Team,
              Opponent: playerStats.Opponent,
              GameDate: playerStats.GameDate,
              Assists: playerStats.Assists,
              Goals: playerStats.Goals,
              Points: playerStats.Points,
            });
            console.log('');
            
            // Test settlement
            const assistsValue = playerStats.Assists;
            if (assistsValue !== undefined) {
              console.log(`📊 Settlement Test:`);
              console.log(`  Stat Value (Assists): ${assistsValue}`);
              console.log(`  Line: ${line}`);
              console.log(`  Over/Under: ${overUnder}`);
              
              let result;
              if (overUnder === 'Over') {
                result = assistsValue > line ? 'win' : assistsValue < line ? 'loss' : 'push';
              } else if (overUnder === 'Under') {
                result = assistsValue < line ? 'win' : assistsValue > line ? 'loss' : 'push';
              }
              
              console.log(`  Result: ${result.toUpperCase()}`);
              if (result === 'win') {
                console.log(`  ✅ Bet WINS! (${assistsValue} ${overUnder === 'Over' ? '>' : '<'} ${line})`);
              } else if (result === 'loss') {
                console.log(`  ❌ Bet LOSES (${assistsValue} ${overUnder === 'Over' ? '<=' : '>='} ${line})`);
              } else {
                console.log(`  ➖ Bet PUSHES (${assistsValue} === ${line})`);
              }
            }
          } else {
            console.log(`⚠️  Player stats not found for PlayerID ${playerId}`);
          }
        }
      } else {
        console.log(`⚠️  Alternative endpoint also failed: ${altResponse.status}`);
      }
    }
  } catch (error) {
    console.error('❌ Error fetching player stats:', error.message);
    console.error(error.stack);
  }

  console.log('');
  console.log('📋 Summary:');
  console.log('  • Game: Los Angeles Kings @ Toronto Maple Leafs');
  console.log('  • Player: Anthony Stolarz (ID: 30000259)');
  console.log('  • Prop: Assists Over 2');
  console.log('  • Endpoint: /nhl/odds/json/PlayerPropsByPlayerID/{date}/{playerId}');
}

testNHLPlayerProp().catch(console.error);

