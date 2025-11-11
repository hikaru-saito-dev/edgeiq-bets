import { IBet } from '@/models/Bet';

export interface BetSummary {
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  winRate: number;
  roi: number;
  unitsPL: number;
  currentStreak: number;
  longestStreak: number;
}

/**
 * Calculate comprehensive betting statistics from a list of bets
 */
export function calculateStats(bets: IBet[]): BetSummary {
  const settledBets = bets.filter(bet => 
    bet.result !== 'pending'
  );

  const totalBets = settledBets.length;
  const wins = settledBets.filter(b => b.result === 'win').length;
  const losses = settledBets.filter(b => b.result === 'loss').length;
  const pushes = settledBets.filter(b => b.result === 'push').length;
  const voids = settledBets.filter(b => b.result === 'void').length;

  // Calculate win rate (excluding pushes and voids)
  const actionableBets = wins + losses;
  const winRate = actionableBets > 0 ? (wins / actionableBets) * 100 : 0;

  // Calculate units P/L
  // Win: profit based on odds (odds stored as decimal)
  // Loss: -units
  // Push/Void: 0
  // Note: odds are always stored as decimal format in DB
  let unitsPL = 0;
  settledBets.forEach(bet => {
    if (bet.result === 'win') {
      // Decimal odds: profit = units * (odds - 1)
      unitsPL += bet.units * (bet.odds - 1);
    } else if (bet.result === 'loss') {
      unitsPL -= bet.units;
    }
    // push and void don't affect P/L
  });

  // Calculate ROI (Return on Investment)
  const totalUnitsWagered = settledBets.reduce((sum, bet) => {
    if (bet.result === 'void') return sum;
    return sum + bet.units;
  }, 0);
  const roi = totalUnitsWagered > 0 ? (unitsPL / totalUnitsWagered) * 100 : 0;

  // Calculate streaks
  // Sort by creation date (oldest first) to calculate streaks chronologically
  const sortedBets = [...settledBets].sort((a, b) => 
    a.createdAt.getTime() - b.createdAt.getTime()
  );

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  for (const bet of sortedBets) {
    if (bet.result === 'win') {
      tempStreak++;
      currentStreak = tempStreak;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else if (bet.result === 'loss') {
      tempStreak = 0;
      currentStreak = 0;
    }
    // Push and void don't break or extend streaks
  }

  return {
    totalBets,
    wins,
    losses,
    pushes,
    voids,
    winRate: Math.round(winRate * 100) / 100, // Round to 2 decimal places
    roi: Math.round(roi * 100) / 100,
    unitsPL: Math.round(unitsPL * 100) / 100,
    currentStreak,
    longestStreak,
  };
}

/**
 * Update user stats based on their bets
 */
export async function updateUserStats(userId: string, bets: IBet[]): Promise<void> {
  const { User } = await import('@/models/User');
  const stats = calculateStats(bets);
  
  await User.findByIdAndUpdate(userId, {
    $set: {
      'stats.winRate': stats.winRate,
      'stats.roi': stats.roi,
      'stats.unitsPL': stats.unitsPL,
      'stats.currentStreak': stats.currentStreak,
      'stats.longestStreak': stats.longestStreak,
    },
  });
}

/**
 * Filter bets by date range
 */
export function filterBetsByDateRange(
  bets: IBet[], 
  range: 'all' | '30d' | '7d'
): IBet[] {
  if (range === 'all') return bets;
  
  const now = new Date();
  const cutoffDate = new Date();
  
  if (range === '30d') {
    cutoffDate.setDate(now.getDate() - 30);
  } else if (range === '7d') {
    cutoffDate.setDate(now.getDate() - 7);
  }
  
  return bets.filter(bet => bet.createdAt >= cutoffDate);
}

