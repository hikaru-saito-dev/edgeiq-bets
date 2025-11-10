import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { verifyWhopUser, getWhopCompany } from '@/lib/whop';
import { User, MembershipPlan } from '@/models/User';
import { Bet, IBet } from '@/models/Bet';
import { calculateStats } from '@/lib/stats';
import { z } from 'zod';

export const runtime = 'nodejs';

const updateUserSchema = z.object({
  alias: z.string().min(1).max(50).optional(),
  optIn: z.boolean().optional(),
  whopName: z.string().max(100).optional(),
  membershipPlans: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.string(),
    url: z.string(),
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

    const { userId: verifiedUserId, companyId } = authInfo;

    // Find or create user
    let user = await User.findOne({ whopUserId: verifiedUserId, companyId: companyId || 'default' });
    if (!user) {
      // Get company info if available
      let companyInfo = null;
      if (companyId) {
        companyInfo = await getWhopCompany(companyId);
      }

      // Create user if doesn't exist
      user = await User.create({
        whopUserId: verifiedUserId,
        companyId: companyId || 'default',
        alias: `User ${verifiedUserId.slice(0, 8)}`,
        whopName: companyInfo?.name,
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
    }

    // Get all bets and calculate current stats
    const bets = await Bet.find({ userId: user._id }).lean();
    const stats = calculateStats(bets as unknown as IBet[]);

    return NextResponse.json({
      user: {
        alias: user.alias,
        optIn: user.optIn,
        whopUserId: user.whopUserId,
        companyId: user.companyId,
        whopName: user.whopName,
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

    const { userId, companyId } = authInfo;
    const body = await request.json();
    const validated = updateUserSchema.parse(body);

    // Find or create user
    let user = await User.findOne({ whopUserId: userId, companyId: companyId || 'default' });
    if (!user) {
      user = await User.create({
        whopUserId: userId,
        companyId: companyId || 'default',
        alias: validated.alias || `User ${userId.slice(0, 8)}`,
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

