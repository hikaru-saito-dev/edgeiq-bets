import { NextResponse } from 'next/server';
import { verifyWhopUser, userHasCompanyAccess } from '@/lib/whop';

export const runtime = 'nodejs';

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

    const role = await userHasCompanyAccess({ userId, companyId });
    const isAuthorized = role === 'owner' || role === 'admin';

    return NextResponse.json({ role, companyId, isAuthorized });
  } catch (error) {
    console.error('Error checking access role:', error);
    return NextResponse.json({ role: 'none', isAuthorized: false }, { status: 500 });
  }
}

