import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { User, IUser } from '@/models/User';
import { Bet, IBet } from '@/models/Bet';
import { filterBetsByDateRange } from '@/lib/stats';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const range = (searchParams.get('range') || 'all') as 'all' | '30d' | '7d';
    const companyFilter = searchParams.get('companyId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const search = (searchParams.get('search') || '').trim();

    // Only show owners and companyOwners who opted in and have companyId set
    const baseQuery: Record<string, unknown> = { 
      optIn: true,
      role: { $in: ['owner', 'companyOwner'] },
      companyId: { $exists: true, $ne: null },
    };
    if (companyFilter) {
      baseQuery.companyId = companyFilter;
    }

    // Get ALL owners and companyOwners who opted in (for global ranking calculation)
    const allOwners = await User.find(baseQuery).lean();

    // Calculate stats for each owner/companyOwner (aggregating all company bets)
    const allLeaderboardEntries = await Promise.all(
      allOwners.map(async (ownerRaw) => {
        const owner = ownerRaw as unknown as IUser;
        
        if (!owner.companyId) {
          return null; // Skip if no companyId
        }

        // Get all users in the same company (owner + admins)
        const companyUsers = await User.find({ companyId: owner.companyId }).select('_id');
        const companyUserIds = companyUsers.map(u => u._id);
        
        // Get ALL bets from all users in the company (aggregated stats)
        const allCompanyBetsRaw = await Bet.find({ userId: { $in: companyUserIds } }).lean();
        const allCompanyBets = filterBetsByDateRange(allCompanyBetsRaw as unknown as IBet[], range);

        const settledBets = allCompanyBets.filter((bet) => bet.result !== 'pending');
        const actionableBets = settledBets.filter(
          (bet) => bet.result === 'win' || bet.result === 'loss'
        );
        const wins = settledBets.filter((bet) => bet.result === 'win').length;
        const winRate = actionableBets.length > 0 
          ? Math.round((wins / actionableBets.length) * 10000) / 100 
          : 0;

        let unitsPL = 0;
        let totalWagered = 0;
        settledBets.forEach((bet) => {
          if (bet.result === 'void') return;
          totalWagered += bet.units;
          if (bet.result === 'win') {
            unitsPL += bet.units * (bet.odds - 1);
          } else if (bet.result === 'loss') {
            unitsPL -= bet.units;
          }
        });
        const roi = totalWagered > 0 
          ? Math.round((unitsPL / totalWagered) * 10000) / 100 
          : 0;
        const sortedBets = [...settledBets].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
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
        }

        // Get membership plans with affiliate links (use owner's username)
        const userUsername = owner.whopUsername || owner.whopDisplayName || owner.alias || 'user';
        const membershipPlans = (owner.membershipPlans || []).map((plan) => {
          let affiliateLink: string | null = null;
          if (plan.url) {
            try {
              const url = new URL(plan.url);
              url.searchParams.set('a', userUsername);
              affiliateLink = url.toString();
            } catch {
              affiliateLink = `${plan.url}${plan.url.includes('?') ? '&' : '?'}a=${userUsername}`;
            }
          }
          return {
            id: plan.id,
            name: plan.name,
            description: plan.description,
            price: plan.price,
            url: plan.url,
            affiliateLink,
            isPremium: plan.isPremium || false,
          };
        });

        return {
          userId: String(owner._id),
          alias: owner.companyName || owner.alias || owner.whopDisplayName || owner.whopUsername || `Company ${owner.companyId.slice(0, 8)}`,
          companyName: owner.companyName,
          companyDescription: owner.companyDescription,
          whopDisplayName: owner.whopDisplayName,
          whopUsername: owner.whopUsername,
          whopAvatarUrl: owner.whopAvatarUrl,
          companyId: owner.companyId,
          membershipPlans,
          winRate,
          roi,
          plays: settledBets.length,
          currentStreak,
          longestStreak,
        };
      })
    );

    // Filter out null entries
    const validEntries = allLeaderboardEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // Sort ALL entries by ROI then Win% to get global ranking
    validEntries.sort((a, b) => {
      if (b.roi !== a.roi) return b.roi - a.roi;
      return b.winRate - a.winRate;
    });

    // Assign global ranks to all entries
    const globallyRanked = validEntries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    // Filter by search if provided
    let filteredLeaderboard = globallyRanked;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filteredLeaderboard = globallyRanked.filter((entry) => 
        regex.test(entry.alias) || 
        (entry.companyName && regex.test(entry.companyName)) ||
        (entry.whopDisplayName && regex.test(entry.whopDisplayName)) ||
        (entry.whopUsername && regex.test(entry.whopUsername))
      );
    }

    const total = filteredLeaderboard.length;

    // Paginate the filtered results
    const paginatedLeaderboard = filteredLeaderboard.slice(
      (page - 1) * pageSize,
      page * pageSize
    );

    return NextResponse.json({ 
      leaderboard: paginatedLeaderboard,
      range,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
