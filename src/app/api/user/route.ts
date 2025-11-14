import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { verifyWhopUser, getWhopCompany, getWhopUser, userHasCompanyAccess } from '@/lib/whop';
import { User, MembershipPlan } from '@/models/User';
import { Bet, IBet } from '@/models/Bet';
import { calculateStats } from '@/lib/stats';
import { z } from 'zod';

export const runtime = 'nodejs';

// Validate Whop product page URL (not checkout links)
const whopProductUrlSchema = z.string().url().refine(
  (url) => {
    try {
      const urlObj = new URL(url);
      // Must be whop.com domain
      if (!urlObj.hostname.includes('whop.com')) return false;
      // Must not be a checkout link (checkout, pay, purchase, etc.)
      const path = urlObj.pathname.toLowerCase();
      const forbiddenPaths = ['/checkout', '/pay', '/purchase', '/buy', '/payment'];
      if (forbiddenPaths.some(forbidden => path.includes(forbidden))) return false;
      // Must not have query params that indicate checkout
      const queryParams = urlObj.searchParams.toString().toLowerCase();
      if (queryParams.includes('checkout') || queryParams.includes('payment')) return false;
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid Whop product page URL (not a checkout link)' }
);

const updateUserSchema = z.object({
  alias: z.string().min(1).max(50).optional(),
  optIn: z.boolean().optional(),
  whopName: z.string().max(100).optional(),
  whopWebhookUrl: z.union([z.string().url(), z.literal('')]).optional(),
  discordWebhookUrl: z.union([z.string().url(), z.literal('')]).optional(),
  notifyOnSettlement: z.boolean().optional(),
  membershipPlans: z.array(z.object({
    id: z.string(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    price: z.string().max(50),
    url: whopProductUrlSchema,
    isPremium: z.boolean().optional(),
  })).optional(),
});

/**
 * GET /api/user
 * Get current user profile and stats
 */
export async function GET() {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId: verifiedUserId, companyId: companyIdFromAuth } = authInfo;
    const companyId = companyIdFromAuth || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID;

    const accessRole = companyId ? await userHasCompanyAccess({ userId: verifiedUserId, companyId }) : 'none';
    if (accessRole !== 'owner' && accessRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find or create user
    let user = await User.findOne({ whopUserId: verifiedUserId, companyId: companyId || 'default' });
    if (!user) {
      // Fetch user data from Whop API
      const whopUserData = await getWhopUser(verifiedUserId);
      
      // Get company info if available
      let companyInfo = null;
      if (companyId) {
        companyInfo = await getWhopCompany(companyId);
      }

      // Check if this is the first user in the company (set as owner)
      const userCount = await User.countDocuments({ companyId: companyId || 'default' });
      const isFirstUser = userCount === 0;

      // Create user if doesn't exist
      user = await User.create({
        whopUserId: verifiedUserId,
        companyId: companyId || 'default',
        role: isFirstUser ? 'owner' : 'member',
        alias: whopUserData?.name || whopUserData?.username || `User ${verifiedUserId.slice(0, 8)}`,
        whopName: companyInfo?.name,
        whopUsername: whopUserData?.username,
        whopDisplayName: whopUserData?.name,
        whopAvatarUrl: whopUserData?.profilePicture?.sourceUrl,
        optIn: true,
        membershipPlans: [],
        stats: {
          winRate: 0,
          roi: 0,
          unitsPL: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
      });
    } else {
      // Update user data from Whop if missing or outdated
      if (!user.whopUsername || !user.whopDisplayName || !user.whopAvatarUrl) {
        const whopUserData = await getWhopUser(verifiedUserId);
        if (whopUserData) {
          if (!user.whopUsername && whopUserData.username) {
            user.whopUsername = whopUserData.username;
          }
          if (!user.whopDisplayName && whopUserData.name) {
            user.whopDisplayName = whopUserData.name;
          }
          if (!user.whopAvatarUrl && whopUserData.profilePicture?.sourceUrl) {
            user.whopAvatarUrl = whopUserData.profilePicture.sourceUrl;
          }
          // Update alias if it's still a placeholder - use whopDisplayName as default
          if (user.alias.startsWith('User ') && whopUserData.name) {
            user.alias = whopUserData.name;
          } else if (!user.alias && whopUserData.name) {
            user.alias = whopUserData.name;
          }
          await user.save();
        }
      }
    }

    // Get all bets (excluding parlay legs) and calculate current stats
    const bets = await Bet.find({ 
      userId: user._id,
      parlayId: { $exists: false } // Exclude parlay leg bets
    }).lean();
    const stats = calculateStats(bets as unknown as IBet[]);

    return NextResponse.json({
      user: {
        alias: user.alias || user.whopDisplayName || user.whopUsername || `User ${user.whopUserId.slice(0, 8)}`,
        optIn: user.optIn,
        whopUserId: user.whopUserId,
        companyId: user.companyId,
        whopName: user.whopName,
        whopUsername: user.whopUsername,
        whopDisplayName: user.whopDisplayName,
        whopAvatarUrl: user.whopAvatarUrl,
        whopWebhookUrl: user.whopWebhookUrl,
        discordWebhookUrl: user.discordWebhookUrl,
        notifyOnSettlement: user.notifyOnSettlement ?? false,
        membershipPlans: user.membershipPlans || [],
      },
      stats,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user
 * Update user profile (alias, optIn)
 */
export async function PATCH(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, companyId: companyIdFromAuth } = authInfo;

    // Use companyId from auth, or fallback to environment variable
    const companyId = companyIdFromAuth || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID;

    const accessRole = companyId ? await userHasCompanyAccess({ userId, companyId }) : 'none';
    if (accessRole !== 'owner' && accessRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = updateUserSchema.parse(body);

    // Find or create user
    let user = await User.findOne({ whopUserId: userId, companyId: companyId || 'default' });
    if (!user) {
      // Fetch user data from Whop API
      const whopUserData = await getWhopUser(userId);
      
      // Get company info if available
      let companyInfo = null;
      if (companyId) {
        companyInfo = await getWhopCompany(companyId);
      }

      const userCount = await User.countDocuments({ companyId: companyId || 'default' });
      const isFirstUser = userCount === 0;

      user = await User.create({
        whopUserId: userId,
        companyId: companyId || 'default',
        role: isFirstUser ? 'owner' : 'member',
        alias: validated.alias || whopUserData?.name || whopUserData?.username || `User ${userId.slice(0, 8)}`,
        whopName: companyInfo?.name,
        whopUsername: whopUserData?.username,
        whopDisplayName: whopUserData?.name,
        whopAvatarUrl: whopUserData?.profilePicture?.sourceUrl,
        optIn: validated.optIn ?? true,
        membershipPlans: validated.membershipPlans || [],
        stats: {
          winRate: 0,
          roi: 0,
          unitsPL: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
      });
    } else {
      // Update user
      if (validated.alias !== undefined) {
        user.alias = validated.alias;
      }
      if (validated.optIn !== undefined) {
        user.optIn = validated.optIn;
      }
      if (validated.whopName !== undefined) {
        user.whopName = validated.whopName;
      }
      if (validated.whopWebhookUrl !== undefined) {
        user.whopWebhookUrl = validated.whopWebhookUrl || undefined;
      }
      if (validated.discordWebhookUrl !== undefined) {
        user.discordWebhookUrl = validated.discordWebhookUrl || undefined;
      }
      if (validated.notifyOnSettlement !== undefined) {
        user.notifyOnSettlement = validated.notifyOnSettlement;
      }
      if (validated.membershipPlans !== undefined) {
        user.membershipPlans = validated.membershipPlans as MembershipPlan[];
      }
      await user.save();
    }

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error },
        { status: 400 }
      );
    }
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

