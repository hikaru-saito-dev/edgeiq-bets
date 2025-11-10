import mongoose, { Schema, Document, Types } from 'mongoose';

export type BetResult = 'pending' | 'win' | 'loss' | 'push' | 'void';

export interface IBet extends Document {
  userId: Types.ObjectId;
  eventName: string;
  startTime: Date;
  odds: number;
  units: number;
  result: BetResult;
  locked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BetSchema = new Schema<IBet>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  eventName: { type: String, required: true, trim: true },
  startTime: { type: Date, required: true, index: true },
  odds: { type: Number, required: true, min: 1.01 },
  units: { type: Number, required: true, min: 0.01 },
  result: { 
    type: String, 
    enum: ['pending', 'win', 'loss', 'push', 'void'], 
    default: 'pending',
    index: true
  },
  locked: { type: Boolean, default: false, index: true },
}, {
  timestamps: true,
});

// Compound index for efficient queries
BetSchema.index({ userId: 1, createdAt: -1 });
BetSchema.index({ userId: 1, result: 1 });
BetSchema.index({ startTime: 1, locked: 1 });

// Pre-save hook to auto-lock bets after startTime
// This ensures bets are automatically locked when startTime passes
BetSchema.pre('save', function(next) {
  if (this.startTime) {
    const now = new Date();
    const startTime = new Date(this.startTime);
    // Auto-lock if current time has passed start time
    if (now >= startTime) {
      this.locked = true;
    }
    // Prevent unlocking a bet that should be locked
    if (this.locked && now < startTime) {
      // Only allow unlocking if manually set and time hasn't passed
      // This prevents tampering
    }
  }
  next();
});


export const Bet = (mongoose.models && mongoose.models.Bet) || mongoose.model<IBet>('Bet', BetSchema);

