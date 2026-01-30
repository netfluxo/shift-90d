import { createClient } from '@/lib/supabase/server';
import { getDateInBrazil, getTodayInBrazil } from '@/lib/utils/timezone';
import { redirect } from 'next/navigation';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  // Fetch user profile
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  // Fetch user's posts
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      user:users(id, name, avatar_url, points),
      likes:likes(count),
      comments:comments(count)
    `)
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false });

  // Get likes by current user
  const { data: userLikes } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', authUser.id);

  const likedPostIds = new Set(userLikes?.map((like) => like.post_id) || []);

  // Fetch user rankings for posts
  const { data: allUsersForPosts } = await supabase
    .from('users')
    .select('id')
    .order('points', { ascending: false });

  const userRankingMap = new Map<string, number>();
  allUsersForPosts?.forEach((u, index) => {
    userRankingMap.set(u.id, index + 1);
  });

  const transformedPosts = posts?.map((post) => ({
    ...post,
    likes_count: post.likes?.[0]?.count || 0,
    comments_count: post.comments?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
    user_ranking: userRankingMap.get(post.user_id) || 0,
  })) || [];

  // Fetch activity stats directly from Supabase
  const todayInBrazil = getTodayInBrazil();

  // Count today's posts
  const { count: todayPostsCount } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', authUser.id)
    .gte('created_at', `${todayInBrazil}T00:00:00-03:00`)
    .lt('created_at', `${todayInBrazil}T23:59:59.999-03:00`);

  // Get all posts to calculate active days and streak
  const { data: userPosts } = await supabase
    .from('posts')
    .select('created_at')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false });

  // Calculate unique active days from posts (using Brazil timezone)
  const uniqueDates = new Set<string>();
  userPosts?.forEach((post) => {
    // Convert to Brazil timezone before extracting date
    const postDate = getDateInBrazil(new Date(post.created_at));
    uniqueDates.add(postDate);
  });
  const activeDays = uniqueDates.size;

  // Calculate current streak from unique dates
  let currentStreak = 0;
  if (uniqueDates.size > 0) {
    const sortedDates = Array.from(uniqueDates).sort().reverse();
    const today = new Date(todayInBrazil);
    let checkDate = new Date(today);

    // If no activity today, start checking from yesterday
    if (!uniqueDates.has(todayInBrazil)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (const dateStr of sortedDates) {
      const checkDateStr = checkDate.toISOString().split('T')[0];
      if (dateStr === checkDateStr) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (dateStr < checkDateStr) {
        // Date is older than expected, streak is broken
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

  // Calculate user's ranking position
  const { data: allUsersRanking } = await supabase
    .from('users')
    .select('id')
    .order('points', { ascending: false });

  const rankingPosition = (allUsersRanking?.findIndex(u => u.id === authUser.id) ?? -1) + 1;

  // If user profile doesn't exist, create one
  if (!user) {
    const userName = authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Usuario';

    const { error: insertError } = await supabase.from('users').insert({
      id: authUser.id,
      name: userName,
      avatar_url: null,
      points: 0,
    });

    if (insertError) {
      console.error('Error creating user profile:', insertError);
    }

    // Refetch
    const { data: newUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    // Se ainda não conseguiu criar, usar dados do auth
    const userProfile = newUser || {
      id: authUser.id,
      name: userName,
      avatar_url: null,
      points: 0,
      created_at: new Date().toISOString(),
    };

    return (
      <ProfileClient
        user={userProfile}
        posts={[]}
        currentUserId={authUser.id}
        isOwnProfile={true}
        activityStats={activityStats}
        rankingPosition={rankingPosition}
      />
    );
  }

  return (
    <ProfileClient
      user={user}
      posts={transformedPosts}
      currentUserId={authUser.id}
      isOwnProfile={true}
      activityStats={activityStats}
      rankingPosition={rankingPosition}
    />
  );
}
