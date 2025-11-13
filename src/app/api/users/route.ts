import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { User } from '@/models/User';
import { verifyWhopUser, getUserRoleFromDB } from '@/lib/whop';
import { z } from 'zod';

export const runtime = 'nodejs';

const updateRoleSchema = z.object({
  userId: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
});

/**
 * GET /api/users
 * List all users in the company (owner only) with pagination and search
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
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID not found' }, { status: 400 });
    }

    const currentUserRole = await getUserRoleFromDB({ userId, companyId });
    if (currentUserRole !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only owners can view users' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const search = (searchParams.get('search') || '').trim();

    // Build query
    const query: Record<string, unknown> = { companyId };

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { alias: regex },
        { whopUsername: regex },
        { whopDisplayName: regex },
      ];
    }

    // Get total count for pagination
    const totalCount = await User.countDocuments(query);

    // Fetch users with pagination
    const users = await User.find(query)
      .select('whopUserId alias role whopUsername whopDisplayName whopAvatarUrl createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return NextResponse.json({ 
      users,
      totalPages,
      totalCount,
      page,
      pageSize,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users
 * Update user role (owner only)
 */
export async function PATCH(request: NextRequest) {
  try {
    await connectDB();
    const headers = await import('next/headers').then(m => m.headers());
    const authInfo = await verifyWhopUser(headers);

    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId: currentUserId, companyId } = authInfo;
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID not found' }, { status: 400 });
    }

    const currentUserRole = await getUserRoleFromDB({ userId: currentUserId, companyId });
    if (currentUserRole !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only owners can update roles' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, role } = updateRoleSchema.parse(body);

    if (userId === currentUserId) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
    }

    const targetUser = await User.findOne({ whopUserId: userId, companyId });
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'owner' && role !== 'owner') {
      return NextResponse.json({ error: 'Cannot remove owner role from another owner' }, { status: 400 });
    }

    targetUser.role = role;
    await targetUser.save();

    return NextResponse.json({ 
      success: true, 
      user: {
        whopUserId: targetUser.whopUserId,
        alias: targetUser.alias,
        role: targetUser.role,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to update user role' },
      { status: 500 }
    );
  }
}

