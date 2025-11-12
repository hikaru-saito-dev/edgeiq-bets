import { z } from 'zod';
import { validateOdds, normalizeToDecimal, type OddsValue } from './oddsConverter';

/**
 * Schema for game/event selection
 */
export const gameSelectionSchema = z.object({
  // Game search result
  provider: z.string().optional(),
  providerEventId: z.string().optional(),
  sport: z.string().optional(),
  sportKey: z.string().optional(), // The Odds API sport_key
  league: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  homeTeamId: z.string().optional(),
  awayTeamId: z.string().optional(),
  startTime: z.string().datetime().or(z.date()).transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
}).refine((data) => {
  // Either provider + providerEventId OR manual entry (homeTeam + awayTeam + startTime)
  if (data.provider && data.providerEventId) return true;
  if (data.homeTeam && data.awayTeam && data.startTime) return true;
  return false;
}, {
  message: 'Either provide provider + providerEventId or homeTeam + awayTeam + startTime',
});

/**
 * Schema for market selection based on market type
 */
const baseMarketSchema = z.object({
  marketType: z.enum(['ML', 'Spread', 'Parlay', 'Total', 'Player Prop']),
});

const mlMarketSchema = baseMarketSchema.extend({
  marketType: z.literal('ML'),
  selection: z.string().min(1, 'Team selection is required'),
});

const spreadMarketSchema = baseMarketSchema.extend({
  marketType: z.literal('Spread'),
  selection: z.string().min(1, 'Team selection is required'),
  line: z.number(),
});

const totalMarketSchema = baseMarketSchema.extend({
  marketType: z.literal('Total'),
  line: z.number(),
  overUnder: z.enum(['Over', 'Under']),
});

const playerPropMarketSchema = baseMarketSchema.extend({
  marketType: z.literal('Player Prop'),
  playerName: z.string().min(1, 'Player name is required'),
  playerId: z.number().optional(), // SportsData.io Player ID for auto-settlement
  statType: z.string().min(1, 'Stat type is required'),
  line: z.number(),
  overUnder: z.enum(['Over', 'Under']),
});

const parlayMarketSchema = baseMarketSchema.extend({
  marketType: z.literal('Parlay'),
  parlaySummary: z.string().min(1, 'Parlay summary is required'),
});

export const marketSelectionSchema = z.discriminatedUnion('marketType', [
  mlMarketSchema,
  spreadMarketSchema,
  totalMarketSchema,
  playerPropMarketSchema,
  parlayMarketSchema,
]);

/**
 * Schema for odds input
 */
export const oddsInputSchema = z.object({
  oddsFormat: z.enum(['american', 'decimal']),
  oddsValue: z.number(),
}).refine((data) => {
  const odds: OddsValue = {
    format: data.oddsFormat,
    value: data.oddsValue,
  };
  const validation = validateOdds(odds);
  return validation.valid;
}, {
  message: 'Invalid odds value',
});

/**
 * Schema for creating a new bet (enhanced version)
 */
export const createBetSchema = z.object({
  // Game Selection
  game: gameSelectionSchema,
  
  // Market & Selection
  market: marketSelectionSchema,
  
  // Odds & Stake
  odds: oddsInputSchema,
  units: z.number().min(0.01, 'Units must be at least 0.01').max(1000, 'Units too high'),
  
  // Optional Fields
  book: z.string().optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  slipImageUrl: z.string().url().optional(),
  
  // Legacy support (for backward compatibility)
  eventName: z.string().optional(),
}).transform((data) => {
  // Normalize odds to decimal and prepare for storage
  const odds: OddsValue = {
    format: data.odds.oddsFormat,
    value: data.odds.oddsValue,
  };
  const decimalOdds = normalizeToDecimal(odds);
  
  // Generate eventName if not provided (for backward compatibility)
  let eventName = data.eventName;
  if (!eventName) {
    if (data.game.homeTeam && data.game.awayTeam) {
      eventName = `${data.game.awayTeam} @ ${data.game.homeTeam}`;
    } else {
      eventName = 'Event';
    }
  }
  
  return {
    ...data,
    oddsDecimal: decimalOdds,
    oddsAmerican: data.odds.oddsFormat === 'american' ? data.odds.oddsValue : undefined,
    eventName,
  };
});

/**
 * Legacy schema for backward compatibility
 */
export const createBetSchemaLegacy = z.object({
  eventName: z.string().min(1, 'Event name is required').max(200, 'Event name too long'),
  startTime: z.string().datetime().or(z.date()).transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  odds: z.number().min(1.01, 'Odds must be at least 1.01').max(1000, 'Odds too high'),
  units: z.number().min(0.01, 'Units must be at least 0.01').max(1000, 'Units too high'),
});

/**
 * Schema for updating a bet
 */
export const updateBetSchema = z.object({
  // Allow updating optional fields
  book: z.string().optional(),
  notes: z.string().max(1000).optional(),
  slipImageUrl: z.string().url().optional(),
  
  // Legacy fields
  eventName: z.string().min(1).max(200).optional(),
  odds: z.number().min(1.01).max(1000).optional(),
  units: z.number().min(0.01).max(1000).optional(),
}).refine((data) => {
  // At least one field must be provided
  return Object.keys(data).length > 0;
}, {
  message: 'At least one field must be provided for update',
});

/**
 * Schema for settling a bet
 */
export const settleBetSchema = z.object({
  result: z.enum(['win', 'loss', 'push', 'void']),
});

export type CreateBetInput = z.infer<typeof createBetSchema>;
export type CreateBetInputLegacy = z.infer<typeof createBetSchemaLegacy>;
export type UpdateBetInput = z.infer<typeof updateBetSchema>;
export type SettleBetInput = z.infer<typeof settleBetSchema>;
export type GameSelectionInput = z.infer<typeof gameSelectionSchema>;
export type MarketSelectionInput = z.infer<typeof marketSelectionSchema>;
export type OddsInput = z.infer<typeof oddsInputSchema>;
