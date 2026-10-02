import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/lib/admin/service';
import { authorizeAdminMutation, apiError, isAdminUser } from '@/lib/admin/http';

export async function PATCH(request: NextRequest, { params }: { params: { projectId: string } }) {
  const admin = await authorizeAdminMutation(request);
  if (!isAdminUser(admin)) return admin;
  try {
    const body = (await request.json()) as { enabled?: boolean };
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'enabled must be a boolean' }, { status: 400 });
    }
    const changed = await AdminService.setProjectEnabled(params.projectId, body.enabled);
    return changed
      ? NextResponse.json({ success: true })
      : NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
  } catch (error) {
    return apiError(error, 'Could not update project');
  }
}
