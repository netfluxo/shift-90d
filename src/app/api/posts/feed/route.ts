import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const PAGE_SIZE = 10;

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '0', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10), 50);

  const from = page * limit;
  const to = from + limit - 1;

  // Fetch posts with user info and counts
  const { data: posts, error } = await supabase
    .from('posts')
    .select(`
      *,
      user:users(id, name, avatar_url, points),
      likes:likes(count),
      comments:comments(count)
    `)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get likes by current user
  const postIds = posts?.map((p) => p.id) || [];
  const { data: userLikes } = postIds.length > 0
    ? await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds)
    : { data: [] };

  const likedPostIds = new Set(userLikes?.map((like) => like.post_id) || []);

  // Fetch user rankings
  const { data: allUsersRanking } = await supabase
    .from('users')
    .select('id')
    .order('points', { ascending: false });

  const userRankingMap = new Map<string, number>();
  allUsersRanking?.forEach((u, index) => {
    userRankingMap.set(u.id, index + 1);
  });

  // Transform posts
  const transformedPosts = posts?.map((post) => ({
    ...post,
    likes_count: post.likes?.[0]?.count || 0,
    comments_count: post.comments?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
    user_ranking: userRankingMap.get(post.user_id) || 0,
  })) || [];

  return NextResponse.json({
    posts: transformedPosts,
    hasMore: (posts?.length || 0) === limit,
  });
}
