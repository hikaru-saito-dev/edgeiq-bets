const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGO_URI;
const MONGODB_DB = process.env.MONGO_DB;

if (!MONGODB_URI || !MONGODB_DB) {
  console.error('Error: MONGO_URI and MONGO_DB must be set in .env.local');
  process.exit(1);
}

// Bet Schema (simplified)
const BetSchema = new mongoose.Schema({}, { strict: false, collection: 'bets' });
const Bet = mongoose.model('Bet', BetSchema);

async function checkBetStatus() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('✅ Connected to MongoDB\n');

    // Find the specific bet from the image (Philadelphia Eagles @ Green Bay Packers)
    const bet = await Bet.findOne({ 
      $or: [
        { eventName: /Philadelphia.*Green Bay/i },
        { homeTeam: /Green Bay/i, awayTeam: /Philadelphia/i }
      ]
    })
      .select('_id eventName startTime result locked marketType sport league homeTeam awayTeam providerEventId sportKey selection odds units createdAt')
      .lean();

    if (!bet) {
      console.log('❌ Bet not found in database');
      await mongoose.disconnect();
      return;
    }

    const now = new Date();
    const startTime = new Date(bet.startTime);
    const isPastStart = now >= startTime;

    console.log('─'.repeat(80));
    console.log('📋 BET DETAILS:');
    console.log(`   ID: ${bet._id}`);
    console.log(`   Event: ${bet.eventName || `${bet.awayTeam} @ ${bet.homeTeam}`}`);
    console.log(`   Market: ${bet.marketType}`);
    console.log(`   Selection: ${bet.selection || 'N/A'}`);
    console.log(`   Sport: ${bet.sport || 'N/A'}`);
    console.log(`   League: ${bet.league || 'N/A'}`);
    console.log(`   Start Time: ${startTime.toLocaleString()}`);
    console.log(`   Current Time: ${now.toLocaleString()}`);
    console.log(`   Odds: ${bet.odds || 'N/A'}`);
    console.log(`   Units: ${bet.units || 'N/A'}`);
    console.log('');
    console.log('🔍 SETTLEMENT STATUS:');
    console.log(`   Result: ${bet.result.toUpperCase()}`);
    console.log(`   Locked: ${bet.locked ? 'YES 🔒' : 'NO 🔓'}`);
    console.log(`   Event Started: ${isPastStart ? 'YES ⏰' : 'NO ⏳'}`);
    console.log(`   Provider Event ID: ${bet.providerEventId || '❌ MISSING'}`);
    console.log(`   Sport Key: ${bet.sportKey || '❌ MISSING'}`);
    console.log('');

    // Check if it can be auto-settled
    if (bet.result === 'pending') {
      if (!isPastStart) {
        console.log('⚠️  Cannot settle: Event has not started yet');
      } else if (!bet.providerEventId) {
        console.log('⚠️  Cannot settle: Missing providerEventId');
      } else if (!bet.sportKey && bet.marketType !== 'Player Prop') {
        console.log('⚠️  Warning: Missing sportKey (may cause issues)');
        console.log('   Recommendation: Update bet with sportKey');
      } else {
        console.log('✅ Can be auto-settled!');
        console.log('   Run: POST /api/bets/settle-all to settle all pending bets');
      }
    } else {
      console.log(`✅ Bet already settled as: ${bet.result.toUpperCase()}`);
    }

    // Check all pending bets summary
    const allPending = await Bet.countDocuments({ result: 'pending' });
    const pendingPastStart = await Bet.countDocuments({ 
      result: 'pending',
      startTime: { $lte: now }
    });
    const canSettle = await Bet.countDocuments({ 
      result: 'pending',
      startTime: { $lte: now },
      providerEventId: { $exists: true, $ne: null }
    });

    console.log('');
    console.log('─'.repeat(80));
    console.log('📊 DATABASE SUMMARY:');
    console.log(`   Total Pending Bets: ${allPending}`);
    console.log(`   Pending (Past Start): ${pendingPastStart}`);
    console.log(`   Can Auto-Settle: ${canSettle}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkBetStatus();
