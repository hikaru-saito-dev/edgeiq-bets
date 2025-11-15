import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { verifyWhopUser } from '@/lib/whop';
import { Bet, IBet } from '@/models/Bet';
import { User } from '@/models/User';
import { Log } from '@/models/Log';
import { 
  createBetSchema, 
  createBetSchemaLegacy,
  type GameSelectionInput,
  type MarketSelectionInput,
} from '@/utils/validateBet';
import { z } from 'zod';
import { updateUserStats } from '@/lib/stats';
import { 
  notifyBetCreated, 
  notifyBetDeleted,
} from '@/lib/betNotifications';

export const runtime = 'nodejs';

interface ParlayLine {
  marketType: 'ML' | 'Spread' | 'Total';
  selection?: string;
  line?: number;
  overUnder?: 'Over' | 'Under';
}

/**
 * Parse parlay summary into individual bet lines
 * Supports formats like:
 * - "Lakers -3.5" or "Lakers +3.5" (Spread)
 * - "Lakers ML" (Moneyline)
 * - "Lakers O 115.5" or "Lakers Over 115.5" (Total Over)
 * - "Lakers U 115.5" or "Lakers Under 115.5" (Total Under)
 * - "Over 115.5" or "Under 115.5" (Total without team name)
 */
function parseParlaySummary(summary: string): ParlayLine[] {
  const lines: ParlayLine[] = [];
  // Split by newlines, also handle "+" separator (e.g., "Lakers ML + Celtics -5.5")
  const summaryLines = summary
    .split(/[\n+]/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  
  for (const line of summaryLines) {
    // Match patterns like "Over 115.5" or "Under 115.5" (Total without team name)
    const totalOnlyOverMatch = line.match(/^(?:O|Over)\s+(\d+\.?\d*)$/i);
    if (totalOnlyOverMatch) {
      const lineNum = parseFloat(totalOnlyOverMatch[1]);
      if (!isNaN(lineNum)) {
        lines.push({
          marketType: 'Total',
          line: lineNum,
          overUnder: 'Over',
        });
        continue;
      }
    }
    
    const totalOnlyUnderMatch = line.match(/^(?:U|Under)\s+(\d+\.?\d*)$/i);
    if (totalOnlyUnderMatch) {
      const lineNum = parseFloat(totalOnlyUnderMatch[1]);
      if (!isNaN(lineNum)) {
        lines.push({
          marketType: 'Total',
          line: lineNum,
          overUnder: 'Under',
        });
        continue;
      }
    }
    
    // Match patterns like "Team -3.5", "Team +3.5" (Spread)
    const spreadMatch = line.match(/^(.+?)\s+([+-]?\d+\.?\d*)$/);
    if (spreadMatch) {
      const [, team, lineStr] = spreadMatch;
      const lineNum = parseFloat(lineStr);
      if (!isNaN(lineNum)) {
        lines.push({
          marketType: 'Spread',
          selection: team.trim(),
          line: lineNum,
        });
        continue;
      }
    }
    
    // Match patterns like "Team ML" (Moneyline)
    if (line.match(/\bML\b$/i)) {
      const team = line.replace(/\s+ML\s*$/i, '').trim();
      if (team) {
        lines.push({
          marketType: 'ML',
          selection: team,
        });
        continue;
      }
    }
    
    // Match patterns like "Team O 115.5" or "Team Over 115.5" (Total Over)
    const overMatch = line.match(/^(.+?)\s+(?:O|Over)\s+(\d+\.?\d*)$/i);
    if (overMatch) {
      const [, team, lineStr] = overMatch;
      const lineNum = parseFloat(lineStr);
      if (!isNaN(lineNum)) {
        lines.push({
          marketType: 'Total',
          selection: team.trim(),
          line: lineNum,
          overUnder: 'Over',
        });
        continue;
      }
    }
    
    // Match patterns like "Team U 115.5" or "Team Under 115.5" (Total Under)
    const underMatch = line.match(/^(.+?)\s+(?:U|Under)\s+(\d+\.?\d*)$/i);
    if (underMatch) {
      const [, team, lineStr] = underMatch;
      const lineNum = parseFloat(lineStr);
      if (!isNaN(lineNum)) {
        lines.push({
          marketType: 'Total',
          selection: team.trim(),
          line: lineNum,
          overUnder: 'Under',
        });
        continue;
      }
    }
  }
  
  return lines;
}

/**
 * GET /api/bets
 * Get bets for the authenticated user with pagination and text search
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = authInfo;

    // Find user by whopUserId (companyId is manually entered, not from Whop auth)
    const user = await User.findOne({ whopUserId: userId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is owner or admin
    if (user.role !== 'companyOwner' && user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Only owners and admins can view bets.' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const search = (searchParams.get('search') || '').trim();

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

    // Exclude parlay legs from top-level listing
    Object.assign(query, { parlayId: { $exists: false } });

    const total = await Bet.countDocuments(query);
    const bets = await Bet.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    type LeanBet = Awaited<typeof bets>[number];

    const parlayIds = bets
      .filter((bet) => bet.marketType === 'Parlay')
      .map((bet) => String(bet._id));

    let legsByParlayId: Record<string, LeanBet[]> = {};
    if (parlayIds.length > 0) {
      const legDocs = await Bet.find({
        userId: user._id,
        parlayId: { $in: parlayIds },
      })
        .sort({ startTime: 1 })
        .lean();

      legsByParlayId = legDocs.reduce<Record<string, LeanBet[]>>((acc, leg) => {
        const key = leg.parlayId ? String(leg.parlayId) : null;
        if (!key) return acc;
        if (!acc[key]) acc[key] = [];
        acc[key].push(leg as LeanBet);
        return acc;
      }, {});
    }

    const betsWithLegs = bets.map((bet) =>
      bet.marketType === 'Parlay'
        ? {
            ...bet,
            parlayLegs: legsByParlayId[String(bet._id)] ?? [],
          }
        : bet
    );

    return NextResponse.json({
      bets: betsWithLegs,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
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

    const { userId } = authInfo;

    // Find user by whopUserId (companyId is manually entered, not from Whop auth)
    const user = await User.findOne({ whopUserId: userId });
    if (!user) {
      return NextResponse.json({ error: 'User not found. Please set up your profile first.' }, { status: 404 });
    }

    // Check if user is owner or admin
    if (user.role !== 'companyOwner' && user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Only owners and admins can create bets.' }, { status: 403 });
    }

    // Require companyId to be set before creating bets
    if (!user.companyId) {
      return NextResponse.json({ 
        error: 'Company ID is required. Please set your company ID in your profile before creating bets.' 
      }, { status: 400 });
    }

    // For admins: validate that their companyId matches an owner's companyId
    if (user.role === 'admin') {
      const ownerWithCompanyId = await User.findOne({ 
        companyId: user.companyId, 
        $or: [
          { role: 'owner' },
          { role: 'companyOwner' }
        ]
      });
      if (!ownerWithCompanyId) {
        return NextResponse.json({ 
          error: 'Invalid Company ID. Your company ID must match an existing owner\'s company ID. Please update your profile with a valid company ID.' 
        }, { status: 400 });
      }
    }

    const companyId = user.companyId;

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

    // User already found and validated above - use it for bet creation
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
        companyId: user.companyId,
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
        companyId: user.companyId,
        eventName: validatedNew.eventName,
        sport: validatedNew.game.sport,
        sportKey: validatedNew.game.sportKey, // Store sportKey for auto-settlement
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
          playerId: (validatedNew.market as { playerId?: number }).playerId,
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

    // Create main bet
    const bet = await Bet.create(betData);

    // If this is a parlay, create individual bet entries for each line
    const parlayLines: IBet[] = [];
    if (validatedNew && validatedNew.market.marketType === 'Parlay') {
      // Prefer structured legs if provided; otherwise parse summary for backward compatibility
  type NonParlayMarket = Extract<MarketSelectionInput, { marketType: 'ML' | 'Spread' | 'Total' | 'Player Prop' }>;
  type ParlayLegInput = {
    game: GameSelectionInput;
    market: NonParlayMarket;
    label?: string;
  };
  const structuredLegs = validatedNew.parlay?.legs as ParlayLegInput[] | undefined;
      if (structuredLegs && Array.isArray(structuredLegs) && structuredLegs.length > 0) {
        for (const leg of structuredLegs) {
          const legGame = leg.game;
          const m = leg.market;
          const legStart = legGame.startTime ? new Date(legGame.startTime) : validatedNew.game.startTime;
          const lockedLeg = new Date() >= legStart;
          const eventName =
            legGame.awayTeam && legGame.homeTeam
              ? `${legGame.awayTeam} @ ${legGame.homeTeam}`
              : legGame.homeTeam ?? legGame.awayTeam ?? validatedNew.eventName;

          const lineBetData: Record<string, unknown> = {
            userId: user._id,
            startTime: legStart,
            units: 0.01,
            odds: 1.01,
            oddsFormat: 'decimal' as const,
            result: 'pending' as const,
            locked: lockedLeg,
            companyId: user.companyId,
            eventName,
            sport: legGame.sport,
            sportKey: legGame.sportKey,
            league: legGame.league,
            homeTeam: legGame.homeTeam,
            awayTeam: legGame.awayTeam,
            homeTeamId: legGame.homeTeamId,
            awayTeamId: legGame.awayTeamId,
            provider: legGame.provider,
            providerEventId: legGame.providerEventId,
            marketType: m.marketType,
            parlayId: bet._id,
          };

          switch (m.marketType) {
            case 'ML':
              lineBetData.selection = m.selection;
              break;
            case 'Spread':
              lineBetData.selection = m.selection;
              lineBetData.line = m.line;
              break;
            case 'Total':
              lineBetData.line = m.line;
              lineBetData.overUnder = m.overUnder;
              break;
            case 'Player Prop':
              lineBetData.playerName = m.playerName;
              if (m.playerId !== undefined) {
                lineBetData.playerId = m.playerId;
              }
              lineBetData.statType = m.statType;
              lineBetData.line = m.line;
              lineBetData.overUnder = m.overUnder;
              break;
            default:
              break;
          }

          const lineBet = await Bet.create(lineBetData);
          parlayLines.push(lineBet);
        }
      } else if (validatedNew.market.parlaySummary) {
        const parsedLines = parseParlaySummary(validatedNew.market.parlaySummary);
        for (const line of parsedLines) {
          const lineBetData: Record<string, unknown> = {
            userId: user._id,
            startTime: validatedNew.game.startTime,
            units: 0.01,
            odds: 1.01,
            oddsFormat: 'decimal' as const,
            result: 'pending' as const,
            locked: new Date() >= validatedNew.game.startTime,
            companyId: user.companyId,
            eventName: validatedNew.eventName,
            sport: validatedNew.game.sport,
            sportKey: validatedNew.game.sportKey,
            league: validatedNew.game.league,
            homeTeam: validatedNew.game.homeTeam,
            awayTeam: validatedNew.game.awayTeam,
            homeTeamId: validatedNew.game.homeTeamId,
            awayTeamId: validatedNew.game.awayTeamId,
            provider: validatedNew.game.provider,
            providerEventId: validatedNew.game.providerEventId,
            marketType: line.marketType,
            parlayId: bet._id,
            ...(line.selection && { selection: line.selection }),
            ...(line.line !== undefined && { line: line.line }),
            ...(line.overUnder && { overUnder: line.overUnder }),
          };
          const lineBet = await Bet.create(lineBetData);
          parlayLines.push(lineBet);
        }
      }
    }

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

    await notifyBetCreated(bet, user, companyId || user.companyId);

    return NextResponse.json({ 
      bet, 
      ...(parlayLines.length > 0 && { parlayLines }) 
    }, { status: 201 });
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
 * PUT /api/bets?action=settle
 * Manual settlement is disabled - bets are auto-settled based on game results
 */
export async function PUT() {
  return NextResponse.json(
    { error: 'Manual settlement is disabled. Bets are automatically settled based on game results.' },
    { status: 403 }
  );
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

    const { userId } = authInfo;

    // Find user by whopUserId (companyId is manually entered, not from Whop auth)
    const user = await User.findOne({ whopUserId: userId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is owner or admin
    if (user.role !== 'companyOwner' && user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Only owners and admins can delete bets.' }, { status: 403 });
    }

    const body = await request.json();
    const { betId } = body;

    if (!betId) {
      return NextResponse.json({ error: 'betId is required' }, { status: 400 });
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

    // Save bet data before deletion for notification
    const betData = bet.toObject();
    
    // If parlay, delete all legs linked to it
    if (bet.marketType === 'Parlay') {
      await Bet.deleteMany({ parlayId: bet._id, userId: user._id });
    }

    await bet.deleteOne();
    await Log.create({
      userId: user._id,
      betId: bet._id,
      action: 'bet_deleted',
      metadata: {},
    });

    // Send notification with saved bet data
    await notifyBetDeleted(betData as unknown as IBet, user);

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

