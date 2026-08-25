import { getAuth } from '@/lib/auth/server';
import { createPost } from '@/lib/db/queries/posts';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Fora do try para que o catch consiga atribuir a falha a um usuário.
  let userId: string | null = null;

  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      console.error('[publish] create_post_unauthorized');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    userId = session.user.id;

    const body = (await request.json()) as {
      media_url?: string;
      media_type?: string;
      caption?: string;
    };
    const { media_url, media_type, caption } = body;

    if (!media_url || !media_type) {
      console.error('[publish] create_post_missing_fields', {
        userId,
        hasMediaUrl: Boolean(media_url),
        mediaType: media_type ?? null,
      });
      return NextResponse.json(
        { success: false, error: 'Missing required fields: media_url and media_type' },
        { status: 400 }
      );
    }

    if (!['image', 'video'].includes(media_type)) {
      console.error('[publish] create_post_invalid_media_type', { userId, mediaType: media_type });
      return NextResponse.json(
        { success: false, error: 'Invalid media_type. Must be "image" or "video"' },
        { status: 400 }
      );
    }

    const { post, pointsAwarded, dailyPostsCount } = await createPost(
      session.user.id,
      media_url,
      media_type as 'image' | 'video',
      caption || null
    );

    console.log('[publish] create_post_ok', {
      userId,
      postId: post.id,
      mediaType: media_type,
      pointsAwarded,
      dailyPostsCount,
    });

    return NextResponse.json({
      success: true,
      post,
      points_awarded: pointsAwarded,
      daily_posts_count: dailyPostsCount,
      daily_limit_reached: dailyPostsCount >= 1,
    });
  } catch (error) {
    // `errorMessage`, não `error`: chave reservada do evento de log (ver /api/client-error).
    console.error('[publish] create_post_failed', {
      userId,
      errorMessage: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
