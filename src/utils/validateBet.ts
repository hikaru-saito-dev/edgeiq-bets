import { z } from 'zod';

/**
 * Schema for creating a new bet
 */
export const createBetSchema = z.object({
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
  eventName: z.string().min(1).max(200).optional(),
  startTime: z.string().datetime().or(z.date()).transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }).optional(),
  odds: z.number().min(1.01).max(1000).optional(),
  units: z.number().min(0.01).max(1000).optional(),
});

/**
 * Schema for settling a bet
 */
export const settleBetSchema = z.object({
  result: z.enum(['win', 'loss', 'push', 'void']),
});

export type CreateBetInput = z.infer<typeof createBetSchema>;
export type UpdateBetInput = z.infer<typeof updateBetSchema>;
export type SettleBetInput = z.infer<typeof settleBetSchema>;

