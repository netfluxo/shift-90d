import { headers } from 'next/headers';
import { getAuth } from '@/lib/auth/server';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(request: Request) {
  try {
    // Validate session
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = session.user.id;
    const body = (await request.json()) as { name?: string; avatarUrl?: string };
    const { name, avatarUrl } = body;

    // Build update object dynamically (only include fields that are present)
    const updateFields: Record<string, string | null> = {};
    if (name !== undefined) {
      updateFields.name = name;
    }
    if (avatarUrl !== undefined) {
      updateFields.avatarUrl = avatarUrl;
    }

    // If no fields to update, return early
    if (Object.keys(updateFields).length === 0) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update user in database
    const db = getDb();
    await db.update(users).set(updateFields).where(eq(users.id, userId));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('PATCH /api/profile error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
