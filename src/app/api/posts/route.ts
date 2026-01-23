import { createClient } from '@/lib/supabase/server';
import { getTodayInBrazil } from '@/lib/utils/timezone';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { media_url, media_type, caption } = body;

    // Validate input
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

    // Get today's date in Brazil timezone
    const todayInBrazil = getTodayInBrazil();

    // Count posts created today (in Brazil timezone)
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
    const shouldAwardPoints = dailyPostsCount < 3;

    // Insert the post
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

    let pointsAwarded = false;

    // Award points if under daily limit
    if (shouldAwardPoints) {
      // Update user points
      const { error: pointsError } = await supabase
        .from('users')
        .update({ points: supabase.rpc('increment_points', { increment: 1 }) })
        .eq('id', user.id);

      if (pointsError) {
        // Use raw SQL since increment_points RPC might not exist
        const { error: rawPointsError } = await supabase
          .rpc('increment', {
            row_id: user.id,
            table_name: 'users',
            column_name: 'points',
            increment_by: 1
          });

        if (rawPointsError) {
          // Fallback: manual increment
          const { data: userData } = await supabase
            .from('users')
            .select('points')
            .eq('id', user.id)
            .single();

          if (userData) {
            await supabase
              .from('users')
              .update({ points: (userData.points || 0) + 1 })
              .eq('id', user.id);
          }
        }
      }

      // Upsert user_activity record
      const { error: activityError } = await supabase
        .from('user_activity')
        .upsert(
          {
            user_id: user.id,
            activity_date: todayInBrazil,
            posts_count: dailyPostsCount + 1,
            points_earned: Math.min(dailyPostsCount + 1, 3), // Max 3 points per day
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,activity_date',
            ignoreDuplicates: false,
          }
        );

      if (activityError) {
        console.error('Error updating user_activity:', activityError);
        // Don't fail the request, activity tracking is secondary
      }

      pointsAwarded = true;
    } else {
      // Still update activity count even if no points awarded
      const { error: activityError } = await supabase
        .from('user_activity')
        .upsert(
          {
            user_id: user.id,
            activity_date: todayInBrazil,
            posts_count: dailyPostsCount + 1,
            points_earned: 3, // Already at max
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,activity_date',
            ignoreDuplicates: false,
          }
        );

      if (activityError) {
        console.error('Error updating user_activity:', activityError);
      }
    }

    return NextResponse.json({
      success: true,
      post,
      points_awarded: pointsAwarded,
      daily_posts_count: dailyPostsCount + 1,
      daily_limit_reached: dailyPostsCount + 1 >= 3,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/posts:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
