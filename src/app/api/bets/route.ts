import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { verifyWhopUser, getWhopCompany } from '@/lib/whop';
import { Bet, IBet } from '@/models/Bet';
import { User } from '@/models/User';
import { Log } from '@/models/Log';
import { createBetSchema, updateBetSchema, settleBetSchema } from '@/utils/validateBet';
import { updateUserStats } from '@/lib/stats';

export const runtime = 'nodejs';

/**
 * GET /api/bets
 * Get all bets for the authenticated user
 */
export async function GET() {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, companyId } = authInfo;

    // Find or create user
    let user = await User.findOne({ whopUserId: userId, companyId: companyId || 'default' });
    if (!user) {
      // Get company info if available
      let companyInfo = null;
      if (companyId) {
        companyInfo = await getWhopCompany(companyId);
      }

      // Create user if doesn't exist
      user = await User.create({
        whopUserId: userId,
        companyId: companyId || 'default',
        alias: `User ${userId.slice(0, 8)}`,
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

    // Get all bets for this user
    const bets = await Bet.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ bets });
  } catch (error) {
    console.error('Error fetching bets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bets
 * Create a new bet
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, companyId } = authInfo;

    const body = await request.json();
    const validated = createBetSchema.parse(body);

    // Find or create user
    let user = await User.findOne({ whopUserId: userId, companyId: companyId || 'default' });
    if (!user) {
      // Create user if doesn't exist
      user = await User.create({
        whopUserId: userId,
        companyId: companyId || 'default',
        alias: `User ${userId.slice(0, 8)}`,
        optIn: true,
        stats: {
          winRate: 0,
          roi: 0,
          unitsPL: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
      });
    }

    // Check if bet is already locked (startTime has passed)
    const locked = new Date() >= validated.startTime;

    // Create bet
    const bet = await Bet.create({
      userId: user._id,
      eventName: validated.eventName,
      startTime: validated.startTime,
      odds: validated.odds,
      units: validated.units,
      result: 'pending',
      locked,
    });

    // Log the action
    await Log.create({
      userId: user._id,
      betId: bet._id,
      action: 'bet_created',
      metadata: { eventName: validated.eventName, odds: validated.odds, units: validated.units },
    });

    return NextResponse.json({ bet }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error },
        { status: 400 }
      );
    }
    console.error('Error creating bet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bets
 * Update an existing bet (only if not locked)
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
    const { betId, ...updateData } = body;

    if (!betId) {
      return NextResponse.json({ error: 'betId is required' }, { status: 400 });
    }

    const validated = updateBetSchema.parse(updateData);

    // Find user
    const user = await User.findOne({ whopUserId: userId, companyId: companyId || 'default' });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find bet
    const bet = await Bet.findOne({ _id: betId, userId: user._id });
    if (!bet) {
      return NextResponse.json({ error: 'Bet not found' }, { status: 404 });
    }

    // Anti-tamper: Multiple layers of protection
    const now = new Date();
    const startTime = new Date(bet.startTime);
    
    // Check 1: Bet is already locked
    if (bet.locked) {
      return NextResponse.json(
        { error: 'Bet is locked and cannot be edited. Event has already started.' },
        { status: 403 }
      );
    }
    
    // Check 2: Current time has passed start time
    if (now >= startTime) {
      // Auto-lock the bet if it hasn't been locked yet
      bet.locked = true;
      await bet.save();
      return NextResponse.json(
        { error: 'Cannot edit bet after event start time. Bet has been automatically locked.' },
        { status: 403 }
      );
    }
    
    // Check 3: If updating startTime, ensure it's in the future
    if (validated.startTime) {
      const newStartTime = new Date(validated.startTime);
      if (newStartTime <= now) {
        return NextResponse.json(
          { error: 'Start time must be in the future' },
          { status: 400 }
        );
      }
    }

    // Update bet
    Object.assign(bet, validated);
    
    // Final check: Re-validate lock status after update
    const finalStartTime = validated.startTime ? new Date(validated.startTime) : bet.startTime;
    if (now >= finalStartTime) {
      bet.locked = true;
    }
    
    await bet.save();

    // Log the action
    await Log.create({
      userId: user._id,
      betId: bet._id,
      action: 'bet_updated',
      metadata: updateData,
    });

    return NextResponse.json({ bet });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error },
        { status: 400 }
      );
    }
    console.error('Error updating bet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/bets?action=settle
 * Settle a bet (mark as win/loss/push/void)
 */
export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, companyId } = authInfo;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action !== 'settle') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const body = await request.json();
    const { betId, result } = body;

    if (!betId) {
      return NextResponse.json({ error: 'betId is required' }, { status: 400 });
    }

    const validated = settleBetSchema.parse({ result });

    // Find user
    const user = await User.findOne({ whopUserId: userId, companyId: companyId || 'default' });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find bet
    const bet = await Bet.findOne({ _id: betId, userId: user._id });
    if (!bet) {
      return NextResponse.json({ error: 'Bet not found' }, { status: 404 });
    }

    // Validation: Cannot settle a bet before the event has started
    const now = new Date();
    const startTime = new Date(bet.startTime);
    
    if (now < startTime) {
      return NextResponse.json(
        { error: 'Cannot settle bet before event start time. The event must begin before you can mark the result.' },
        { status: 400 }
      );
    }

    // Update bet result
    bet.result = validated.result;
    await bet.save();

    // Recalculate user stats
    const allBets = await Bet.find({ userId: user._id }).lean();
    await updateUserStats(user._id.toString(), allBets as unknown as IBet[]);

    // Log the action
    await Log.create({
      userId: user._id,
      betId: bet._id,
      action: 'bet_settled',
      metadata: { result: validated.result },
    });

    return NextResponse.json({ bet });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error },
        { status: 400 }
      );
    }
    console.error('Error settling bet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bets
 * Delete a bet for the authenticated user (only before event starts)
 */
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, companyId } = authInfo;
    const body = await request.json();
    const { betId } = body;

    if (!betId) {
      return NextResponse.json({ error: 'betId is required' }, { status: 400 });
    }

    const user = await User.findOne({ whopUserId: userId, companyId: companyId || 'default' });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const bet = await Bet.findOne({ _id: betId, userId: user._id });
    if (!bet) {
      return NextResponse.json({ error: 'Bet not found' }, { status: 404 });
    }

    if (bet.locked || new Date() >= new Date(bet.startTime)) {
      return NextResponse.json(
        { error: 'Cannot delete bet after event start time.' },
        { status: 403 }
      );
    }

    await bet.deleteOne();
    await Log.create({
      userId: user._id,
      betId: bet._id,
      action: 'bet_deleted',
      metadata: {},
    });

    // Optionally, recalculate stats
    const allBets = await Bet.find({ userId: user._id }).lean();
    await updateUserStats(user._id.toString(), allBets as unknown as IBet[]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting bet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

