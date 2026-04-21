import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import FeedClient from './FeedClient';

export default async function FeedPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch posts with user info and counts
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      user:users(id, name, avatar_url, points),
      likes:likes(count),
      comments:comments(count)
    `)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get likes by current user to know which posts are liked
  const { data: userLikes } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id);

  const likedPostIds = new Set(userLikes?.map((like) => like.post_id) || []);

  // Fetch user rankings
  const { data: allUsersRanking } = await supabase
    .from('user_points_view')
    .select('id')
    .order('points', { ascending: false });

  // Create a map of user id to ranking position
  const userRankingMap = new Map<string, number>();
  allUsersRanking?.forEach((u, index) => {
    userRankingMap.set(u.id, index + 1);
  });

  // Transform posts data
  const transformedPosts = posts?.map((post) => ({
    ...post,
    likes_count: post.likes?.[0]?.count || 0,
    comments_count: post.comments?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
    user_ranking: userRankingMap.get(post.user_id) || 0,
  })) || [];

  const hasMore = (posts?.length || 0) === 10;

  return <FeedClient posts={transformedPosts} currentUserId={user.id} hasMore={hasMore} />;
}
