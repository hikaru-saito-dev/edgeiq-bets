import mongoose, { Schema, Document } from 'mongoose';

export interface MembershipPlan {
  id: string;
  name: string;
  price: string; // e.g., "Free", "$19.99 / month"
  url: string; // Membership URL for this plan
  isPremium?: boolean; // Whether this is a premium/paid plan
}

export type UserRole = 'owner' | 'admin' | 'member';

export interface IUser extends Document {
  alias: string;
  whopUserId: string;
  companyId: string; // Whop company/organization ID
  role: UserRole; // User role: owner, admin, or member
  whopName?: string; // Name of the Whop/company
  whopUsername?: string; // Username from Whop profile
  whopDisplayName?: string; // Display name from Whop profile
  whopAvatarUrl?: string; // Avatar URL from Whop profile
  whopWebhookUrl?: string; // Whop webhook URL for notifications
  discordWebhookUrl?: string; // Discord webhook URL for notifications
  membershipPlans?: MembershipPlan[]; // Array of membership plans for this Whop
  membershipUrl?: string; // Legacy: Primary membership URL (deprecated, use membershipPlans)
  optIn: boolean;
  stats: {
    winRate: number;
    roi: number;
    unitsPL: number;
    currentStreak: number;
    longestStreak: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const MembershipPlanSchema = new Schema<MembershipPlan>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: String, required: true },
  url: { type: String, required: true },
  isPremium: { type: Boolean, default: false },
}, { _id: false });

const UserSchema = new Schema<IUser>({
  alias: { type: String, required: true, trim: true },
  whopUserId: { type: String, required: true, index: true },
  companyId: { type: String, required: true, index: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member', index: true },
  whopName: { type: String, trim: true },
  whopUsername: { type: String, trim: true },
  whopDisplayName: { type: String, trim: true },
  whopAvatarUrl: { type: String, trim: true },
  whopWebhookUrl: { type: String, trim: true },
  discordWebhookUrl: { type: String, trim: true },
  membershipPlans: { type: [MembershipPlanSchema], default: [] },
  membershipUrl: { type: String }, // Legacy field for backward compatibility
  optIn: { type: Boolean, default: true },
  stats: {
    winRate: { type: Number, default: 0 },
    roi: { type: Number, default: 0 },
    unitsPL: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
UserSchema.index({ companyId: 1, whopUserId: 1 }, { unique: true }); // Unique user per company
UserSchema.index({ companyId: 1, optIn: 1, 'stats.roi': -1, 'stats.winRate': -1 }); // For company-scoped leaderboard

export const User = (mongoose.models && mongoose.models.User) || mongoose.model<IUser>('User', UserSchema);

