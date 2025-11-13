import { NextResponse } from 'next/server';
import { verifyWhopUser, getUserRoleFromDB, getWhopUser, getWhopCompany } from '@/lib/whop';
import connectDB from '@/lib/db';
import { User } from '@/models/User';

export const runtime = 'nodejs';

/**
 * Ensure user exists in database (create if doesn't exist)
 * First user in company becomes owner, others become member
 */
async function ensureUserExists(userId: string, companyId: string): Promise<'owner' | 'admin' | 'member' | 'none'> {
  await connectDB();
  
  let user = await User.findOne({ whopUserId: userId, companyId });
  
  if (!user) {
    // Check if this is the first user in the company (set as owner)
    const userCount = await User.countDocuments({ companyId });
    const isFirstUser = userCount === 0;
    
    // Create user - first user becomes owner, others become member
    const whopUserData = await getWhopUser(userId);
    const companyInfo = await getWhopCompany(companyId);
    
    user = await User.create({
      whopUserId: userId,
      companyId,
      role: isFirstUser ? 'owner' : 'member',
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
    
    return user.role || 'member';
  }
  
  return user.role || 'member';
}

export async function GET() {
  try {
    const headers = await import('next/headers').then((m) => m.headers());
    const authInfo = await verifyWhopUser(headers);

    if (!authInfo) {
      return NextResponse.json({ role: 'none', isAuthorized: false }, { status: 401 });
    }

    const { userId, companyId } = authInfo;

    if (!companyId) {
      return NextResponse.json({ role: 'none', isAuthorized: false }, { status: 200 });
    }

    // Ensure user exists (create if first user, otherwise check existing role)
    const role = await ensureUserExists(userId, companyId);
    const isAuthorized = role === 'owner' || role === 'admin';

    return NextResponse.json({ role, companyId, isAuthorized });
  } catch (error) {
    return NextResponse.json({ role: 'none', isAuthorized: false }, { status: 500 });
  }
}

