import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/lib/admin/service';
import { authorizeAdminMutation, apiError, isAdminUser } from '@/lib/admin/http';
import { KeyEnvironment } from '@/types';

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const admin = await authorizeAdminMutation(request);
  if (!isAdminUser(admin)) return admin;
  try {
    const body = (await request.json()) as { name?: string; environment?: KeyEnvironment };
    const name = body.name?.trim() || 'Primary key';
    const environment = body.environment === 'test' ? 'test' : 'live';
    if (name.length > 100) {
      return NextResponse.json({ success: false, error: 'Key name is too long' }, { status: 400 });
    }
    const key = await AdminService.createProjectKey(params.projectId, name, environment);
    return NextResponse.json({ success: true, key }, { status: 201 });
  } catch (error) {
    return apiError(error, 'Could not create project key');
  }
}
