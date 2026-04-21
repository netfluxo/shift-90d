import { createClient } from '@/lib/supabase/server';
import { getDateInBrazil, getTodayInBrazil } from '@/lib/utils/timezone';
import { notFound, redirect } from 'next/navigation';
import { buildDenseRankingMap } from '@/lib/utils/ranking';
import ProfileClient from '../ProfileClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function UserProfilePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  // If viewing own profile, redirect to /profile
  if (id === authUser.id) {
    redirect('/profile');
  }

  // Fetch user profile (pontos vêm do ledger via user_points_view)
  const { data: user } = await supabase
    .from('user_points_view')
    .select('*')
    .eq('id', id)
    .single();

  if (!user) {
    notFound();
  }

  // Fetch user's posts
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      user:users(id, name, avatar_url),
      likes:likes(count),
      comments:comments(count)
    `)
    .eq('user_id', id)
    .order('created_at', { ascending: false });

  // Get likes by current user
  const { data: userLikes } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', authUser.id);

  const likedPostIds = new Set(userLikes?.map((like) => like.post_id) || []);

  // Fetch all users for dense ranking (used for posts and profile badge)
  const { data: allUsersForRanking } = await supabase
    .from('user_points_view')
    .select('id, points')
    .order('points', { ascending: false });

  const userRankingMap = buildDenseRankingMap(allUsersForRanking || []);

  const transformedPosts = posts?.map((post) => ({
    ...post,
    likes_count: post.likes?.[0]?.count || 0,
    comments_count: post.comments?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
    user_ranking: userRankingMap.get(post.user_id) || 0,
  })) || [];

  // Fetch activity stats for this user
  const todayInBrazil = getTodayInBrazil();

  // Count today's posts
  const { count: todayPostsCount } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', id)
    .gte('created_at', `${todayInBrazil}T00:00:00-03:00`)
    .lt('created_at', `${todayInBrazil}T23:59:59.999-03:00`);

  // Get all posts to calculate active days and streak
  const { data: userPosts } = await supabase
    .from('posts')
    .select('created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false });

  // Calculate unique active days from posts (using Brazil timezone)
  const uniqueDates = new Set<string>();
  userPosts?.forEach((post) => {
    const postDate = getDateInBrazil(new Date(post.created_at));
    uniqueDates.add(postDate);
  });
  const activeDays = uniqueDates.size;

  // Calculate current streak from unique dates
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

  const activityStats = {
    total_active_days: activeDays || 0,
    current_streak: currentStreak,
    total_points: user?.points || 0,
    today_posts: todayPostsCount || 0,
    today_points: Math.min(todayPostsCount || 0, 1),
  };

  const rankingPosition = userRankingMap.get(id) || 0;

  return (
    <ProfileClient
      user={user}
      posts={transformedPosts}
      currentUserId={authUser.id}
      isOwnProfile={false}
      activityStats={activityStats}
      rankingPosition={rankingPosition}
    />
  );
}
