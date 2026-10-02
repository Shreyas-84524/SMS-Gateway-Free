import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/lib/admin/service';
import { authorizeAdminMutation, apiError, isAdminUser } from '@/lib/admin/http';

export async function POST(request: NextRequest) {
  const admin = await authorizeAdminMutation(request);
  if (!isAdminUser(admin)) return admin;
  try {
    const body = (await request.json()) as { name?: string; device_id?: string; model?: string };
    const name = body.name?.trim();
    if (!name || name.length > 100) {
      return NextResponse.json({ success: false, error: 'Gateway name is required' }, { status: 400 });
    }
    const gateway = await AdminService.registerGateway(name, body.device_id?.trim(), body.model?.trim());
    return NextResponse.json({ success: true, gateway }, { status: 201 });
  } catch (error) {
    return apiError(error, 'Could not register gateway');
  }
}
