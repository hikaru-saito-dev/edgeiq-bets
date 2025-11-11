import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { verifyWhopUser, getWhopCompany, getWhopUser } from '@/lib/whop';
import { Bet, IBet } from '@/models/Bet';
import { User } from '@/models/User';
import { Log } from '@/models/Log';
import { 
  createBetSchema, 
  createBetSchemaLegacy,
  updateBetSchema, 
  settleBetSchema 
} from '@/utils/validateBet';
import { z } from 'zod';
import { updateUserStats } from '@/lib/stats';

export const runtime = 'nodejs';

/**
 * GET /api/bets
 * Get bets for the authenticated user with pagination, search and grouping
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, companyId } = authInfo;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const search = (searchParams.get('search') || '').trim();
    const groupField = searchParams.get('groupField'); // e.g., 'sport' | 'league' | 'marketType'
    const groupValue = searchParams.get('groupValue') || '';

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

      // Create user if doesn't exist
      user = await User.create({
        whopUserId: userId,
        companyId: companyId || 'default',
        alias: whopUserData?.name || whopUserData?.username || `User ${userId.slice(0, 8)}`,
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
    }

    // Build query
    const query: Record<string, unknown> = { userId: user._id };

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      Object.assign(query, {
        $or: [
          { eventName: regex },
          { sport: regex },
          { league: regex },
          { homeTeam: regex },
          { awayTeam: regex },
          { selection: regex },
          { marketType: regex },
          { book: regex },
          { notes: regex },
        ],
      });
    }

    if (groupField && groupValue) {
      // Filter by a specific group value
      const indexableQuery: Record<string, unknown> = query;
      indexableQuery[groupField] = groupValue;
    }

    const total = await Bet.countDocuments(query);
    const bets = await Bet.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // Optional aggregation summary by groupField
    let groups: Array<{ key: string; count: number }> = [];
    if (groupField && !groupValue) {
      const pipeline = [
        { $match: { userId: user._id } },
        ...(search
          ? [{
              $match: {
                $or: [
                  { eventName: { $regex: search, $options: 'i' } },
                  { sport: { $regex: search, $options: 'i' } },
                  { league: { $regex: search, $options: 'i' } },
                  { homeTeam: { $regex: search, $options: 'i' } },
                  { awayTeam: { $regex: search, $options: 'i' } },
                  { selection: { $regex: search, $options: 'i' } },
                  { marketType: { $regex: search, $options: 'i' } },
                  { book: { $regex: search, $options: 'i' } },
                  { notes: { $regex: search, $options: 'i' } },
                ],
              },
            }]
          : []),
        { $group: { _id: `$${groupField}`, count: { $sum: 1 } } },
        { $sort: { count: -1 as 1 | -1 } },
      ];
      const agg = await Bet.aggregate(pipeline);
      type AggregationGroup = { _id: string; count: number };
      groups = (agg as AggregationGroup[])
        .filter((g) => g._id)
        .map((g) => ({ key: String(g._id), count: g.count }));
    }

    return NextResponse.json({
      bets,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      ...(groupField ? { groupField, groupValue, groups } : {}),
    });
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
    
    // Try new schema first, fall back to legacy if it fails
    let validatedNew: z.infer<typeof createBetSchema> | null = null;
    let validatedLegacy: z.infer<typeof createBetSchemaLegacy> | null = null;
    let isLegacy = false;
    
    try {
      validatedNew = createBetSchema.parse(body);
    } catch {
      // Fall back to legacy schema for backward compatibility
      try {
        validatedLegacy = createBetSchemaLegacy.parse(body);
        isLegacy = true;
      } catch {
        return NextResponse.json(
          { error: 'Validation error' },
          { status: 400 }
        );
      }
    }

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

      // Create user if doesn't exist
      user = await User.create({
        whopUserId: userId,
        companyId: companyId || 'default',
        alias: whopUserData?.name || whopUserData?.username || `User ${userId.slice(0, 8)}`,
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
    }

    // Determine startTime and create bet data
    let startTime: Date;
    let betData: Record<string, unknown>;
    
    if (isLegacy && validatedLegacy) {
      // Legacy format
      startTime = validatedLegacy.startTime;
      const locked = new Date() >= startTime;
      
      betData = {
        userId: user._id,
        startTime,
        units: validatedLegacy.units,
        result: 'pending' as const,
        locked,
        companyId: companyId || undefined,
        eventName: validatedLegacy.eventName,
        odds: validatedLegacy.odds,
        oddsFormat: 'decimal' as const,
        marketType: 'ML' as const,
      };
    } else if (validatedNew) {
      // New format
      startTime = validatedNew.game.startTime;
      const locked = new Date() >= startTime;
      
      betData = {
        userId: user._id,
        startTime,
        units: validatedNew.units,
        result: 'pending' as const,
        locked,
        companyId: companyId || undefined,
        eventName: validatedNew.eventName,
        sport: validatedNew.game.sport,
        league: validatedNew.game.league,
        homeTeam: validatedNew.game.homeTeam,
        awayTeam: validatedNew.game.awayTeam,
        homeTeamId: validatedNew.game.homeTeamId,
        awayTeamId: validatedNew.game.awayTeamId,
        provider: validatedNew.game.provider,
        providerEventId: validatedNew.game.providerEventId,
        marketType: validatedNew.market.marketType,
        ...(validatedNew.market.marketType === 'ML' && { selection: validatedNew.market.selection }),
        ...(validatedNew.market.marketType === 'Spread' && { 
          selection: validatedNew.market.selection,
          line: validatedNew.market.line,
        }),
        ...(validatedNew.market.marketType === 'Total' && { 
          line: validatedNew.market.line,
          overUnder: validatedNew.market.overUnder,
        }),
        ...(validatedNew.market.marketType === 'Player Prop' && { 
          playerName: validatedNew.market.playerName,
          statType: validatedNew.market.statType,
          line: validatedNew.market.line,
          overUnder: validatedNew.market.overUnder,
        }),
        ...(validatedNew.market.marketType === 'Parlay' && { 
          parlaySummary: validatedNew.market.parlaySummary,
        }),
        odds: validatedNew.oddsDecimal,
        oddsFormat: validatedNew.odds.oddsFormat,
        oddsAmerican: validatedNew.oddsAmerican,
        book: validatedNew.book,
        notes: validatedNew.notes,
        slipImageUrl: validatedNew.slipImageUrl,
      };
    } else {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const bet = await Bet.create(betData);

    // Log the action
    await Log.create({
      userId: user._id,
      betId: bet._id,
      action: 'bet_created',
      metadata: isLegacy && validatedLegacy
        ? { eventName: validatedLegacy.eventName, odds: validatedLegacy.odds, units: validatedLegacy.units }
        : validatedNew
        ? { marketType: validatedNew.market.marketType, odds: validatedNew.oddsDecimal, units: validatedNew.units }
        : {},
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
    
    // Update bet (startTime cannot be updated after creation)
    // Only allow updating optional fields: book, notes, slipImageUrl
    // Legacy: also allow updating eventName, odds, units if provided
    if (validated.book !== undefined) bet.book = validated.book;
    if (validated.notes !== undefined) bet.notes = validated.notes;
    if (validated.slipImageUrl !== undefined) bet.slipImageUrl = validated.slipImageUrl;
    
    // Legacy fields (for backward compatibility)
    if (validated.eventName !== undefined) bet.eventName = validated.eventName;
    if (validated.odds !== undefined) bet.odds = validated.odds;
    if (validated.units !== undefined) bet.units = validated.units;
    
    // Final check: Re-validate lock status after update
    if (now >= bet.startTime) {
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

