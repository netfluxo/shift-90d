import { getAuth } from '@/lib/auth/server';
import { createPost } from '@/lib/db/queries/posts';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as {
      media_url?: string;
      media_type?: string;
      caption?: string;
    };
    const { media_url, media_type, caption } = body;

    if (!media_url || !media_type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: media_url and media_type' },
        { status: 400 }
      );
    }

    if (!['image', 'video'].includes(media_type)) {
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

    return NextResponse.json({
      success: true,
      post,
      points_awarded: pointsAwarded,
      daily_posts_count: dailyPostsCount,
      daily_limit_reached: dailyPostsCount >= 1,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/posts:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
