import { getAuth } from '@/lib/auth/server';
import { getUserActivity } from '@/lib/db/queries/point-events';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { userId } = await params;

    const activity = await getUserActivity(userId);

    return NextResponse.json({
      success: true,
      user_id: userId,
      total_active_days: activity.totalActiveDays,
      current_streak: activity.currentStreak,
      total_points: activity.totalPoints,
      today_posts: activity.todayPosts,
      today_points: activity.todayPoints,
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/users/[userId]/activity:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
