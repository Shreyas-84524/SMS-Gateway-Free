import { NextRequest, NextResponse } from 'next/server';
import { clearAdminSession, isSameOrigin } from '@/lib/admin/auth';

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, error: 'Cross-origin request rejected' }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  clearAdminSession(response);
  return response;
}
