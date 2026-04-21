import { createClient } from '@/lib/supabase/server';
import { getDateInBrazil, getTodayInBrazil } from '@/lib/utils/timezone';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { userId } = await params;

    // Pontos e dias ativos — ledger via view
    const { data: userData, error: userError } = await supabase
      .from('user_points_view')
      .select('points, active_days')
      .eq('id', userId)
      .single();

    if (userError) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const todayInBrazil = getTodayInBrazil();

    // Posts de hoje (BRT)
    const { count: todayPostsCount, error: postsCountError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `${todayInBrazil}T00:00:00-03:00`)
      .lt('created_at', `${todayInBrazil}T23:59:59.999-03:00`);

    if (postsCountError) {
      console.error('Error counting today posts:', postsCountError);
    }

    // Streak — derivado dos posts (mesma lógica do profile/page.tsx)
    const { data: userPosts } = await supabase
      .from('posts')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const uniqueDates = new Set<string>();
    userPosts?.forEach((post) => {
      uniqueDates.add(getDateInBrazil(new Date(post.created_at)));
    });

    let currentStreak = 0;
    if (uniqueDates.size > 0) {
      const sortedDates = Array.from(uniqueDates).sort().reverse();
      const today = new Date(todayInBrazil);
      const checkDate = new Date(today);

      if (!uniqueDates.has(todayInBrazil)) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      for (const dateStr of sortedDates) {
        const checkDateStr = checkDate.toISOString().split('T')[0];
        if (dateStr === checkDateStr) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (dateStr < checkDateStr) {
          break;
        }
      }
    }

    const todayPosts = todayPostsCount || 0;

    return NextResponse.json({
      success: true,
      user_id: userId,
      total_active_days: userData.active_days || 0,
      current_streak: currentStreak,
      total_points: userData.points || 0,
      today_posts: todayPosts,
      today_points: Math.min(todayPosts, 1),
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/users/[userId]/activity:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
