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
    .order('created_at', { ascending: false });

  // Get likes by current user to know which posts are liked
  const { data: userLikes } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id);

  const likedPostIds = new Set(userLikes?.map((like) => like.post_id) || []);

  // Transform posts data
  const transformedPosts = posts?.map((post) => ({
    ...post,
    likes_count: post.likes?.[0]?.count || 0,
    comments_count: post.comments?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
  })) || [];

  return <FeedClient posts={transformedPosts} currentUserId={user.id} />;
}
