import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/lib/admin/service';
import { authorizeAdminMutation, apiError, isAdminUser } from '@/lib/admin/http';

export async function POST(request: NextRequest, { params }: { params: { gatewayId: string } }) {
  const admin = await authorizeAdminMutation(request);
  if (!isAdminUser(admin)) return admin;
  try {
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim() || 'Device key';
    if (name.length > 100) {
      return NextResponse.json({ success: false, error: 'Key name is too long' }, { status: 400 });
    }
    const key = await AdminService.createGatewayKey(params.gatewayId, name);
    return NextResponse.json({ success: true, key }, { status: 201 });
  } catch (error) {
    return apiError(error, 'Could not create gateway key');
  }
}
