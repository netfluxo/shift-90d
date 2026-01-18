import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
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

  // Fetch user profile
  const { data: user } = await supabase
    .from('users')
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
      user:users(id, name, avatar_url, points),
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

  const transformedPosts = posts?.map((post) => ({
    ...post,
    likes_count: post.likes?.[0]?.count || 0,
    comments_count: post.comments?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
  })) || [];

  return (
    <ProfileClient
      user={user}
      posts={transformedPosts}
      currentUserId={authUser.id}
      isOwnProfile={false}
    />
  );
}
