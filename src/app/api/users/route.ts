import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { User } from '@/models/User';
import { verifyWhopUser } from '@/lib/whop';
import { z } from 'zod';

export const runtime = 'nodejs';

const updateRoleSchema = z.object({
  userId: z.string(),
  role: z.enum(['companyOwner', 'owner', 'admin', 'member']),
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

    const { userId } = authInfo;

    // Find current user by whopUserId (companyId is manually entered, not from Whop auth)
    const currentUser = await User.findOne({ whopUserId: userId });
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is companyOwner or owner
    if (currentUser.role !== 'companyOwner' && currentUser.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only company owners and owners can view users' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const search = (searchParams.get('search') || '').trim();

    // Build query based on role:
    // - companyOwner: can see ALL users
    // - owner: can see users in their company OR users without companyId
    const query: Record<string, unknown> = {};
    
    if (currentUser.role === 'owner') {
      // Owner can see users in their company OR users without companyId
      const companyId = currentUser.companyId;
      if (!companyId) {
        return NextResponse.json({ 
          error: 'Company ID not set. Please set your company ID in your profile first.' 
        }, { status: 400 });
      }
      query.$or = [
        { companyId },
        { companyId: { $exists: false } },
        { companyId: null },
      ];
    }
    // If companyOwner, query remains empty (shows all users)

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const searchConditions = [
        { alias: regex },
        { whopUsername: regex },
        { whopDisplayName: regex },
      ];
      
      // Combine search with existing $or if it exists
      if (query.$or) {
        // If we already have $or (from owner role filter), combine with AND logic
        query.$and = [
          { $or: query.$or },
          { $or: searchConditions },
        ];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
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
  } catch {
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

    const { userId: currentUserId } = authInfo;

    // Find current user by whopUserId (companyId is manually entered, not from Whop auth)
    const currentUser = await User.findOne({ whopUserId: currentUserId });
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is companyOwner or owner
    if (currentUser.role !== 'companyOwner' && currentUser.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only company owners and owners can update roles' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, role } = updateRoleSchema.parse(body);

    if (userId === currentUserId) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
    }

    // Find target user
    let targetUser;
    if (currentUser.role === 'companyOwner') {
      // CompanyOwner can manage any user
      targetUser = await User.findOne({ whopUserId: userId });
    } else {
      // Owner can manage users in their company OR users without companyId
      const companyId = currentUser.companyId;
      if (!companyId) {
        return NextResponse.json({ 
          error: 'Company ID not set. Please set your company ID in your profile first.' 
        }, { status: 400 });
      }
      targetUser = await User.findOne({
        whopUserId: userId,
        $or: [
          { companyId },
          { companyId: { $exists: false } },
          { companyId: null },
        ],
      });
    }

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent role changes that would violate constraints
    if (targetUser.role === 'companyOwner' && role !== 'companyOwner') {
      return NextResponse.json({ error: 'Cannot remove company owner role' }, { status: 400 });
    }
    if (targetUser.role === 'owner' && role !== 'owner' && currentUser.role !== 'companyOwner') {
      return NextResponse.json({ error: 'Only company owner can remove owner role from another owner' }, { status: 400 });
    }

    // If owner is granting a role to a user without companyId, assign owner's companyId
    if (currentUser.role === 'owner' && !targetUser.companyId && role !== 'member') {
      const companyId = currentUser.companyId;
      if (companyId) {
        // Check if assigning owner role - only one owner per companyId allowed
        if (role === 'owner') {
          const existingOwner = await User.findOne({ 
            companyId, 
            $or: [
              { role: 'owner' },
              { role: 'companyOwner' }
            ] ,
            _id: { $ne: targetUser._id }
          });
          if (existingOwner) {
            return NextResponse.json(
              { error: 'Another owner already exists for this company' },
              { status: 400 }
            );
          }
        }
        targetUser.companyId = companyId;
      }
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

