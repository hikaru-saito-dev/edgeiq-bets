import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { verifyWhopUser } from '@/lib/whop';
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
  companyId: z.string().min(1).max(100).optional(),
  companyName: z.string().max(100).optional(),
  companyDescription: z.string().max(500).optional(),
  optIn: z.boolean().optional(), // Only owners can opt-in
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
  })).optional(), // Only owners can manage membership plans
});

/**
 * GET /api/user
 * Get current user profile and stats
 * For owners: returns both personal stats and company stats (aggregated from all company bets)
 */
export async function GET() {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId: verifiedUserId } = authInfo;

    // Find user by whopUserId only (companyId is manually entered)
    const user = await User.findOne({ whopUserId: verifiedUserId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get personal bets (excluding parlay legs) and calculate personal stats
    const personalBets = await Bet.find({ 
      userId: user._id,
      parlayId: { $exists: false }
    }).lean();
    const personalStats = calculateStats(personalBets as unknown as IBet[]);

    // For owners and companyOwners: also get company stats (aggregated from all company bets)
    let companyStats = null;
    if ((user.role === 'owner' || user.role === 'companyOwner') && user.companyId) {
      // Get all users in the same company
      const companyUsers = await User.find({ companyId: user.companyId }).select('_id');
      const companyUserIds = companyUsers.map(u => u._id);
      
      // Get all bets from all users in the company
      const companyBets = await Bet.find({ 
        userId: { $in: companyUserIds },
        parlayId: { $exists: false }
      }).lean();
      companyStats = calculateStats(companyBets as unknown as IBet[]);
    }

    return NextResponse.json({
      user: {
        alias: user.alias,
        role: user.role,
        companyId: user.companyId,
        companyName: user.companyName,
        companyDescription: user.companyDescription,
        optIn: user.optIn,
        whopUsername: user.whopUsername,
        whopDisplayName: user.whopDisplayName,
        whopAvatarUrl: user.whopAvatarUrl,
        whopWebhookUrl: user.whopWebhookUrl,
        discordWebhookUrl: user.discordWebhookUrl,
        notifyOnSettlement: user.notifyOnSettlement ?? false,
        membershipPlans: user.membershipPlans || [],
      },
      personalStats,
      companyStats, // Only for owners with companyId
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
 * Update user profile
 * - Only owners can opt-in to leaderboard
 * - Only owners can manage membership plans
 * - Only owners can set companyName and companyDescription
 * - Enforce only 1 owner per companyId
 */
export async function PATCH(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = authInfo;

    const body = await request.json();
    const validated = updateUserSchema.parse(body);

    // Find user
    const user = await User.findOne({ whopUserId: userId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update alias (all roles can update)
    if (validated.alias !== undefined) {
      user.alias = validated.alias;
    }

    // Update companyId (owners, companyOwners and admins can set)
    if (validated.companyId !== undefined && validated.companyId !== user.companyId) {
      if (user.role === 'owner' || user.role === 'companyOwner') {
        // Check if another owner already exists for this companyId
        const existingOwner = await User.findOne({ 
          companyId: validated.companyId, 
          role: 'owner',
          _id: { $ne: user._id }
        });
        if (existingOwner) {
          return NextResponse.json(
            { error: 'Another owner already exists for this company' },
            { status: 400 }
          );
        }
      } else if (user.role === 'admin') {
        // Admins can only set companyId that matches an existing owner's companyId
        if (validated.companyId) {
          const existingOwner = await User.findOne({ 
            companyId: validated.companyId, 
            role: 'owner'
          });
          if (!existingOwner) {
            return NextResponse.json(
              { error: 'Company ID must match an existing owner\'s company ID. Please enter a valid company ID that belongs to an owner.' },
              { status: 400 }
            );
          }
        }
      }
      user.companyId = validated.companyId || undefined;
    }

    // Update companyName and companyDescription (only owners and companyOwners)
    if (user.role === 'owner' || user.role === 'companyOwner') {
      if (validated.companyName !== undefined) {
        user.companyName = validated.companyName || undefined;
      }
      if (validated.companyDescription !== undefined) {
        user.companyDescription = validated.companyDescription || undefined;
      }
      
      // Only owners and companyOwners can opt-in to leaderboard
      if (validated.optIn !== undefined) {
        user.optIn = validated.optIn;
      }
      
      // Only owners can manage membership plans
      if (validated.membershipPlans !== undefined) {
        user.membershipPlans = validated.membershipPlans as MembershipPlan[];
      }
    } else {
      // Admins cannot opt-in or manage membership plans
      if (validated.optIn !== undefined || validated.membershipPlans !== undefined) {
        return NextResponse.json(
          { error: 'Only owners and company owners can opt-in to leaderboard and manage membership plans' },
          { status: 403 }
        );
      }
    }

    // Update webhook URLs (all roles can update)
    if (validated.whopWebhookUrl !== undefined) {
      user.whopWebhookUrl = validated.whopWebhookUrl || undefined;
    }
    if (validated.discordWebhookUrl !== undefined) {
      user.discordWebhookUrl = validated.discordWebhookUrl || undefined;
    }
    if (validated.notifyOnSettlement !== undefined) {
      user.notifyOnSettlement = validated.notifyOnSettlement;
    }

    await user.save();

    return NextResponse.json({ 
      message: 'User updated successfully',
      user: {
        alias: user.alias,
        role: user.role,
        companyId: user.companyId,
        companyName: user.companyName,
        companyDescription: user.companyDescription,
        optIn: user.optIn,
        membershipPlans: user.membershipPlans,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
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
