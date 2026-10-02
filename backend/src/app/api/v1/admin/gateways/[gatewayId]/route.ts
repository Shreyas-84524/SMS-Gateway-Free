import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/lib/admin/service';
import { authorizeAdminMutation, apiError, isAdminUser } from '@/lib/admin/http';

export async function PATCH(request: NextRequest, { params }: { params: { gatewayId: string } }) {
  const admin = await authorizeAdminMutation(request);
  if (!isAdminUser(admin)) return admin;
  try {
    const body = (await request.json()) as { active?: boolean };
    if (typeof body.active !== 'boolean') {
      return NextResponse.json({ success: false, error: 'active must be a boolean' }, { status: 400 });
    }
    const changed = await AdminService.setGatewayActive(params.gatewayId, body.active);
    return changed
      ? NextResponse.json({ success: true })
      : NextResponse.json({ success: false, error: 'Gateway not found' }, { status: 404 });
  } catch (error) {
    return apiError(error, 'Could not update gateway');
  }
}
