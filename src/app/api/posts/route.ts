import { createClient } from '@/lib/supabase/server';
import { getTodayInBrazil } from '@/lib/utils/timezone';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
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

    const todayInBrazil = getTodayInBrazil();

    const { count: todayPostsCount, error: countError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', `${todayInBrazil}T00:00:00-03:00`)
      .lt('created_at', `${todayInBrazil}T23:59:59-03:00`);

    if (countError) {
      console.error('Error counting posts:', countError);
      return NextResponse.json(
        { success: false, error: 'Failed to check daily post count' },
        { status: 500 }
      );
    }

    const dailyPostsCount = todayPostsCount || 0;
    const shouldAwardPoints = dailyPostsCount < 1;

    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        media_url,
        media_type,
        caption: caption || null,
      })
      .select()
      .single();

    if (postError) {
      console.error('Error creating post:', postError);
      return NextResponse.json(
        { success: false, error: 'Failed to create post' },
        { status: 500 }
      );
    }

    if (shouldAwardPoints) {
      const { error: eventError } = await supabase
        .from('point_events')
        .insert({
          user_id: user.id,
          event_date: todayInBrazil,
          source: 'post',
          points_delta: 1,
          post_id: post.id,
        });

      if (eventError) {
        console.error('Error inserting point_event:', eventError);
      }
    }

    return NextResponse.json({
      success: true,
      post,
      points_awarded: shouldAwardPoints,
      daily_posts_count: dailyPostsCount + 1,
      daily_limit_reached: dailyPostsCount + 1 >= 1,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/posts:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
