import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/lib/auth/server';
import { getFeed } from '@/lib/db/queries/posts';
import { Post } from '@/lib/types';
import FeedClient from './FeedClient';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect('/login');
  }

  // Fetch first page of feed
  const { posts: feedPosts, hasMore, nextCursor } = await getFeed(session.user.id, {
    limit: 10,
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

  return (
    <FeedClient
      posts={transformedPosts}
      currentUserId={session.user.id}
      hasMore={hasMore}
      initialCursor={nextCursor}
    />
  );
}
