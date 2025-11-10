import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { verifyWhopUser, getWhopProducts } from '@/lib/whop';
import { User, IUser, MembershipPlan } from '@/models/User';
import { Bet, IBet } from '@/models/Bet';
import { filterBetsByDateRange } from '@/lib/stats';

export const runtime = 'nodejs';

const AFFILIATE_CODE_DEFAULT = process.env.AFFILIATE_CODE || '?ref=YOUR_AFFILIATE';

interface PlanWithProduct extends MembershipPlan {
  productId?: string;
  productRoute?: string;
}

async function getAffiliateCodeForProduct(productId: string, productRoute: string, companyId?: string): Promise<string> {
  if (!productRoute) {
    return AFFILIATE_CODE_DEFAULT;
  }

  if (productId) {
    const envKey = `AFFILIATE_CODE_PRODUCT_${productId}`;
    const envValue = process.env[envKey];
    if (envValue) return envValue;
  }

  const routeKey = productRoute.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const routeEnvKey = `AFFILIATE_CODE_${routeKey}`;
  const routeEnvValue = process.env[routeEnvKey];
  if (routeEnvValue) return routeEnvValue;

  if (companyId) {
    try {
      const products = await getWhopProducts(companyId);
      const product = products.find(p => p.id === productId || p.route === productRoute);
      
      if (product && product.route) {
        return `https://whop.com/${product.route}`;
      }
    } catch (error) {
      console.error('Error fetching products for affiliate code:', error);
    }
  }

  if (productRoute) {
    return `https://whop.com/${productRoute}`;
  }

  const productNameLower = productRoute.toLowerCase();
  if (productNameLower.includes('free') || productNameLower.includes('trial')) {
    return process.env.AFFILIATE_CODE_FREE_TRIAL || AFFILIATE_CODE_DEFAULT;
  }
  if (productNameLower.includes('premium') || productNameLower.includes('pro')) {
    return process.env.AFFILIATE_CODE_PREMIUM || AFFILIATE_CODE_DEFAULT;
  }

  return AFFILIATE_CODE_DEFAULT;
}

async function getAffiliateCodeForPlan(plan: PlanWithProduct, companyId?: string): Promise<string> {
  if (plan.productRoute) {
    return await getAffiliateCodeForProduct(plan.productId || '', plan.productRoute, companyId);
  }

  if (plan.productId && companyId) {
    try {
      const products = await getWhopProducts(companyId);
      const product = products.find(p => p.id === plan.productId);
      if (product && product.route) {
        return `https://whop.com/${product.route}`;
      }
    } catch (error) {
      console.error('Error fetching product for plan:', error);
    }
  }

  const planName = (plan.name || '').toLowerCase();
  const isFreeTrial = planName.includes('free') || planName.includes('trial') || (!plan.isPremium && plan.price?.toLowerCase().includes('free'));
  
  if (isFreeTrial) {
    return process.env.AFFILIATE_CODE_FREE_TRIAL || AFFILIATE_CODE_DEFAULT;
  }
  if (plan.isPremium) {
    return process.env.AFFILIATE_CODE_PREMIUM || AFFILIATE_CODE_DEFAULT;
  }
  return AFFILIATE_CODE_DEFAULT;
}

function applyAffiliateCode(url: string, affiliateCode: string): string {
  if (affiliateCode.startsWith('http://') || affiliateCode.startsWith('https://')) {
    return affiliateCode;
  }
  if (affiliateCode.startsWith('/')) {
    return `https://whop.com${affiliateCode}`;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${affiliateCode.replace(/^[?&]/, '')}`;
}

async function getMembershipUrl(user: IUser, companyId?: string): Promise<string | null> {
  if (user.membershipPlans && user.membershipPlans.length > 0) {
    const premiumPlan = user.membershipPlans.find((p) => p.isPremium);
    const plan = premiumPlan || user.membershipPlans[0];
    const affiliateCode = await getAffiliateCodeForPlan(plan as PlanWithProduct, companyId);
    return applyAffiliateCode(plan.url, affiliateCode);
  }
  if (user.membershipUrl) {
    return applyAffiliateCode(user.membershipUrl, AFFILIATE_CODE_DEFAULT);
  }
  return null;
}
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    const companyIdFromAuth = authInfo?.companyId;

    const { searchParams } = new URL(request.url);
    const range = (searchParams.get('range') || 'all') as 'all' | '30d' | '7d';
    const companyFilter = searchParams.get('companyId');

    const query: Record<string, unknown> = { optIn: true };
    if (companyFilter) {
      query.companyId = companyFilter;
    } else if (companyIdFromAuth) {
      query.companyId = companyIdFromAuth;
    }

    const users = await User.find(query).lean();
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

        const membershipUrl = await getMembershipUrl(user, companyIdFromAuth || companyFilter || undefined);
        const membershipPlansWithAffiliate = await Promise.all(
          (user.membershipPlans || []).map(async (plan) => {
            const affiliateCode = await getAffiliateCodeForPlan(plan as PlanWithProduct, companyIdFromAuth || companyFilter || undefined);
            return {
              ...plan,
              url: applyAffiliateCode(plan.url, affiliateCode),
            };
          })
        );

        return {
          userId: String(user._id),
          alias: user.alias,
          whopName: user.whopName || user.alias,
          companyId: user.companyId,
          winRate,
          roi,
          plays: settledBets.length,
          currentStreak,
          longestStreak,
          membershipUrl,
          membershipPlans: membershipPlansWithAffiliate,
        };
      })
    );

    leaderboard.sort((a, b) => {
      if (b.roi !== a.roi) return b.roi - a.roi;
      return b.winRate - a.winRate;
    });

    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    return NextResponse.json({ 
      leaderboard: rankedLeaderboard,
      range,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

