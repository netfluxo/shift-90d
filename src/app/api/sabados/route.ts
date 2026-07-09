import { getAuth } from '@/lib/auth/server';
import { createPointEvent, deletePointEvent } from '@/lib/db/queries/point-events';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });

  if (!session?.user || session.user.email !== 'admin@admin.com') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { user_id, event_date } = (await request.json()) as {
    user_id?: string;
    event_date?: string;
  };

  if (!user_id || !event_date) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  await createPointEvent(user_id, event_date, 'saturday_attendance', 1);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });

  if (!session?.user || session.user.email !== 'admin@admin.com') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    await deletePointEvent(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete point event';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
