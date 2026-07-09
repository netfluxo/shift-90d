import { getAuth } from '@/lib/auth/server';
import { toggleLike } from '@/lib/db/queries/likes';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('[API /likes] Request received');

  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    console.log('[API /likes] Auth result:', { hasUser: !!session?.user, userId: session?.user?.id });

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as { post_id?: string };
    const { post_id } = body;

    if (!post_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: post_id' },
        { status: 400 }
      );
    }

    const { action, likesCount } = await toggleLike(session.user.id, post_id);

    return NextResponse.json({
      success: true,
      action,
      likes_count: likesCount,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/likes:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
