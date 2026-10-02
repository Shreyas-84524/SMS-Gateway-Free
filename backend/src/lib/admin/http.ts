import { NextRequest, NextResponse } from 'next/server';
import { AdminUser, isAdminUser, isSameOrigin, requireAdmin } from './auth';

export async function authorizeAdminMutation(
  request: NextRequest
): Promise<AdminUser | NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, error: 'Cross-origin request rejected' }, { status: 403 });
  }
  return requireAdmin(request);
}

export { isAdminUser };

export function apiError(error: unknown, fallback = 'Request failed'): NextResponse {
  console.error(fallback, error);
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes('duplicate key') || message.includes('unique constraint')) {
    return NextResponse.json({ success: false, error: 'That value is already in use' }, { status: 409 });
  }
  if (message.includes('foreign key constraint')) {
    return NextResponse.json({ success: false, error: 'The selected record no longer exists' }, { status: 404 });
  }
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}
