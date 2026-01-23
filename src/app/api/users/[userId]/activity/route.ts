import { createClient } from '@/lib/supabase/server';
import { getTodayInBrazil } from '@/lib/utils/timezone';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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

    const { userId } = await params;

    // Get user's total points
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('points')
      .eq('id', userId)
      .single();

    if (userError) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get today's date in Brazil
    const todayInBrazil = getTodayInBrazil();

    // Count today's posts directly from posts table (more accurate)
    const { count: todayPostsCount, error: postsCountError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `${todayInBrazil}T00:00:00-03:00`)
      .lt('created_at', `${todayInBrazil}T23:59:59.999-03:00`);

    if (postsCountError) {
      console.error('Error counting today posts:', postsCountError);
    }

    // Get today's activity for points earned info
    const { data: todayActivity, error: todayError } = await supabase
      .from('user_activity')
      .select('posts_count, points_earned')
      .eq('user_id', userId)
      .eq('activity_date', todayInBrazil)
      .maybeSingle();

    // Get total active days (count distinct dates)
    const { count: activeDays, error: activeDaysError } = await supabase
      .from('user_activity')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (activeDaysError) {
      console.error('Error counting active days:', activeDaysError);
    }

    // Calculate current streak (consecutive days from today backwards)
    const { data: allActivity, error: allActivityError } = await supabase
      .from('user_activity')
      .select('activity_date')
      .eq('user_id', userId)
      .order('activity_date', { ascending: false })
      .limit(365); // Last year should be enough

    let currentStreak = 0;
    if (allActivity && allActivity.length > 0) {
      // Check if user has activity today or yesterday
      const today = new Date(todayInBrazil);
      let checkDate = new Date(today);

      // If no activity today, check from yesterday
      const hasActivityToday = allActivity[0]?.activity_date === todayInBrazil;
      if (!hasActivityToday) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      // Count consecutive days
      for (const activity of allActivity) {
        const activityDate = new Date(activity.activity_date);
        const checkDateStr = checkDate.toISOString().split('T')[0];

        if (activity.activity_date === checkDateStr) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      total_active_days: activeDays || 0,
      current_streak: currentStreak,
      total_points: userData.points || 0,
      today_posts: todayPostsCount || 0,
      today_points: todayActivity?.points_earned || 0,
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/users/[userId]/activity:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
