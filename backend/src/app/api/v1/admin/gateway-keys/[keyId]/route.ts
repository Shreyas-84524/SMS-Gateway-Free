import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/lib/admin/service';
import { authorizeAdminMutation, apiError, isAdminUser } from '@/lib/admin/http';

export async function DELETE(request: NextRequest, { params }: { params: { keyId: string } }) {
  const admin = await authorizeAdminMutation(request);
  if (!isAdminUser(admin)) return admin;
  try {
    const revoked = await AdminService.revokeGatewayKey(params.keyId);
    return revoked
      ? NextResponse.json({ success: true })
      : NextResponse.json({ success: false, error: 'Key not found' }, { status: 404 });
  } catch (error) {
    return apiError(error, 'Could not revoke gateway key');
  }
}
