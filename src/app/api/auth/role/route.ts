import { NextResponse } from 'next/server';
import { verifyWhopUser, getWhopUser } from '@/lib/whop';
import connectDB from '@/lib/db';
import { User } from '@/models/User';

export const runtime = 'nodejs';

/**
 * Ensure user exists in database (create if doesn't exist)
 * companyId is NOT auto-set from Whop - must be manually entered
 */
async function ensureUserExists(userId: string): Promise<'owner' | 'admin' | 'member' | 'none'> {
  try {
    await connectDB();
    
    // Find user by whopUserId only (companyId is optional and manually entered)
    let user = await User.findOne({ whopUserId: userId });
    
    // Always try to fetch latest user data from Whop API
    let whopUserData = null;
    try {
      whopUserData = await getWhopUser(userId);
    } catch {
      // Continue even if Whop API calls fail
    }
    
    if (!user) {
      // Check if this is the very first user in the database (bootstrap owner)
      const totalUserCount = await User.countDocuments();
      const isFirstUserEver = totalUserCount === 0;
      
      // Create user without companyId (must be manually entered)
      user = await User.create({
        whopUserId: userId,
        // companyId is NOT set - must be manually entered by user
        role: isFirstUserEver ? 'owner' : 'member', // First user becomes owner, others default to member
        alias: whopUserData?.name || whopUserData?.username || `User ${userId.slice(0, 8)}`,
        whopUsername: whopUserData?.username,
        whopDisplayName: whopUserData?.name,
        whopAvatarUrl: whopUserData?.profilePicture?.sourceUrl,
        optIn: false, // Default false, only owners can opt-in
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
      // Bootstrap fix: If this is the only user and they're a member, promote them to owner
      const totalUserCount = await User.countDocuments();
      if (totalUserCount === 1 && user.role === 'member') {
        user.role = 'owner';
        await user.save();
      }
      
      // Update existing user with latest Whop data (especially avatar)
      const updates: {
        whopUsername?: string;
        whopDisplayName?: string;
        whopAvatarUrl?: string;
        whopName?: string;
      } = {};
      
      if (whopUserData) {
        if (whopUserData.username && whopUserData.username !== user.whopUsername) {
          updates.whopUsername = whopUserData.username;
        }
        if (whopUserData.name && whopUserData.name !== user.whopDisplayName) {
          updates.whopDisplayName = whopUserData.name;
        }
        // Always update avatar if available from Whop (even if currently null in DB)
        if (whopUserData.profilePicture?.sourceUrl) {
          if (whopUserData.profilePicture.sourceUrl !== user.whopAvatarUrl) {
            updates.whopAvatarUrl = whopUserData.profilePicture.sourceUrl;
          }
        }
      }
      
      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        Object.assign(user, updates);
        await user.save();
      }
    }
    
    return user.role || 'member';
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    return 'none';
  }
}

export async function GET() {
  try {
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);
    
    if (!authInfo) {
      return NextResponse.json({ role: 'none', isAuthorized: false }, { status: 401 });
    }

    const { userId } = authInfo;

    // Ensure user exists (companyId is NOT auto-set from Whop)
    const role = await ensureUserExists(userId);
    
    // Get user to check if they have companyId set
    await connectDB();
    const user = await User.findOne({ whopUserId: userId });
    const hasCompanyId = !!user?.companyId;
    
    // Users are authorized if they're owner/admin (they need access to set companyId in profile)
    // Note: Some features (like creating bets) still require companyId to be set
    const isAuthorized = role === 'owner' || role === 'admin';

    return NextResponse.json({ 
      role, 
      companyId: user?.companyId || null,
      hasCompanyId,
      isAuthorized 
    });
  } catch {
    return NextResponse.json({ role: 'none', isAuthorized: false }, { status: 500 });
  }
}

