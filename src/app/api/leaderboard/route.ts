import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { verifyWhopUser } from '@/lib/whop';
import { User, IUser } from '@/models/User';
import { Bet, IBet } from '@/models/Bet';
import { filterBetsByDateRange } from '@/lib/stats';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    const companyIdFromAuth = authInfo?.companyId;
    const companyId = companyIdFromAuth || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID;
    const { searchParams } = new URL(request.url);
    const range = (searchParams.get('range') || 'all') as 'all' | '30d' | '7d';
    const companyFilter = searchParams.get('companyId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const search = (searchParams.get('search') || '').trim();

    // Get all owners/admins who opted in
    const userQuery: Record<string, unknown> = { 
      optIn: true,
      role: { $in: ['owner', 'admin'] },
    };
    if (companyFilter) {
      userQuery.companyId = companyFilter;
    } else if (companyId) {
      userQuery.companyId = companyId;
    }

    // Filter by search if provided
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      Object.assign(userQuery, {
        $or: [
          { alias: regex },
          { whopDisplayName: regex },
          { whopUsername: regex },
        ],
      });
    }

    const total = await User.countDocuments(userQuery);

    // Fetch page of users only
    const users = await User.find(userQuery)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // Get stats per user
    const leaderboard = await Promise.all(
      users.map(async (userRaw) => {
        const user = userRaw as unknown as IUser;
        const betsRaw = await Bet.find({ userId: user._id }).lean();
        const bets = filterBetsByDateRange(betsRaw as unknown as IBet[], range);

        const settledBets = bets.filter((bet) => bet.result !== 'pending');
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

        // Get membership plans with affiliate links
        const userUsername = user.whopUsername || user.whopDisplayName || 'woodiee';
        const membershipPlans = (user.membershipPlans || []).map((plan) => {
          let affiliateLink: string | null = null;
          if (plan.url) {
            try {
              const url = new URL(plan.url);
              url.searchParams.set('a', 'woodiee');
              affiliateLink = url.toString();
            } catch {
              affiliateLink = `${plan.url}${plan.url.includes('?') ? '&' : '?'}a=woodiee`;
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
          userId: String(user._id),
          alias: user.alias || user.whopDisplayName || user.whopUsername || `User ${user.whopUserId.slice(0, 8)}`,
          whopName: user.whopName || user.alias,
          whopDisplayName: user.whopDisplayName,
          whopUsername: user.whopUsername,
          whopAvatarUrl: user.whopAvatarUrl,
          companyId: user.companyId,
          membershipPlans,
          winRate,
          roi,
          plays: settledBets.length,
          currentStreak,
          longestStreak,
        };
      })
    );

    // Sort by ROI then Win% (page-sized only)
    leaderboard.sort((a, b) => {
      if (b.roi !== a.roi) return b.roi - a.roi;
      return b.winRate - a.winRate;
    });

    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      ...entry,
      rank: (page - 1) * pageSize + index + 1,
    }));

    return NextResponse.json({ 
      leaderboard: rankedLeaderboard,
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

