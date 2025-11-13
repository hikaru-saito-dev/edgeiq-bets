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

    // Get all unique companyIds from owners/admins who opted in
    const userQuery: Record<string, unknown> = { 
      optIn: true,
      role: { $in: ['owner', 'admin'] },
    };
    if (companyFilter) {
      userQuery.companyId = companyFilter;
    } else if (companyId) {
      userQuery.companyId = companyId;
    }

    // Get all companies with owners/admins
    const companies = await User.distinct('companyId', userQuery);
    
    // Filter companies by search if provided
    let filteredCompanies = companies;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matchingUsers = await User.find({
        ...userQuery,
        $or: [
          { whopUsername: regex },
          { alias: regex },
          { whopDisplayName: regex },
        ],
      }).select('companyId').lean();
      const matchingCompanyIds = [...new Set(matchingUsers.map((u: unknown) => (u as { companyId: string }).companyId))];
      filteredCompanies = companies.filter((cid) => matchingCompanyIds.includes(cid));
    }

    const total = filteredCompanies.length;
    const paginatedCompanies = filteredCompanies.slice((page - 1) * pageSize, page * pageSize);

    // Aggregate stats per company
    const leaderboard = await Promise.all(
      paginatedCompanies.map(async (companyIdValue) => {
        // Get all users in this company (owners/admins who opted in)
        const companyUsers = await User.find({
          companyId: companyIdValue,
          optIn: true,
          role: { $in: ['owner', 'admin'] },
        }).lean();

        // Get owner for membership plans
        const ownerRaw = companyUsers.find((u: unknown) => {
          const user = u as { role?: string };
          return user.role === 'owner';
        });
        const owner = ownerRaw as unknown as IUser;
        const ownerUsername = owner?.whopUsername || owner?.whopDisplayName || 'woodiee';
        
        // Get all membership plans with affiliate links
        const membershipPlans = (owner?.membershipPlans || []).map((plan) => {
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

        // Get all bets from all users in this company
        const userIds = companyUsers.map((u: unknown) => (u as IUser)._id);
        const allBetsRaw = await Bet.find({ userId: { $in: userIds } }).lean();
        const allBets = filterBetsByDateRange(allBetsRaw as unknown as IBet[], range);

        // Aggregate stats
        const settledBets = allBets.filter((bet) => bet.result !== 'pending');
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

        // Calculate streaks across all users
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

        // Get company display info from owner or first admin
        const displayUser = owner || companyUsers[0] as unknown as IUser;
        const companyDisplayName = displayUser?.whopName || displayUser?.whopDisplayName || displayUser?.alias || `Company ${companyIdValue.slice(0, 8)}`;

        return {
          companyId: companyIdValue,
          companyName: companyDisplayName,
          whopName: displayUser?.whopName,
          whopAvatarUrl: displayUser?.whopAvatarUrl,
          membershipPlans,
          winRate,
          roi,
          plays: settledBets.length,
          currentStreak,
          longestStreak,
          memberCount: companyUsers.length,
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

