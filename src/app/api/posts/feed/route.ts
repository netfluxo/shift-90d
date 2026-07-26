import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth/server';
import { getFeed } from '@/lib/db/queries/posts';
import { Post } from '@/lib/types';

const PAGE_SIZE = 10;

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10), 50);
  // `cursor` é o contrato atual (keyset). `page` fica aceito como fallback para
  // clientes que ainda tenham a versão anterior do FeedClient carregada.
  const cursor = searchParams.get('cursor');
  const page = parseInt(searchParams.get('page') || '0', 10);

  const { posts: feedPosts, hasMore, nextCursor } = await getFeed(session.user.id, {
    cursor,
    page,
    limit,
  });

  // Transform FeedPost (camelCase) to Post (snake_case)
  const transformedPosts: Post[] = feedPosts.map((post) => ({
    id: post.id,
    user_id: post.userId,
    media_url: post.mediaUrl,
    media_type: post.mediaType,
    caption: post.caption,
    created_at: post.createdAt.toISOString(),
    user: {
      id: post.user.id,
      name: post.user.name,
      avatar_url: post.user.avatarUrl,
      points: 0, // Not needed on feed, but required by Post type
      created_at: '',
    },
    likes_count: post.likesCount,
    comments_count: post.commentsCount,
    is_liked: post.isLiked,
    user_ranking: post.userRanking || 0,
  }));

  return NextResponse.json({
    posts: transformedPosts,
    hasMore,
    nextCursor,
  }, {
    headers: {
      'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
    },
  });
}
