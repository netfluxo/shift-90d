import { createClient } from '@/lib/supabase/server';
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

  const transformedPosts = posts?.map((post) => ({
    ...post,
    likes_count: post.likes?.[0]?.count || 0,
    comments_count: post.comments?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
  })) || [];

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
      />
    );
  }

  return (
    <ProfileClient
      user={user}
      posts={transformedPosts}
      currentUserId={authUser.id}
      isOwnProfile={true}
    />
  );
}
