import { eq, desc, sql, and, gte, lt, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import {
  posts,
  users,
  likes,
  comments,
  pointEvents,
} from '../schema';
import { getTodayInBrazil, getDateInBrazil } from '@/lib/utils/timezone';

export interface FeedPost {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption: string;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  userRanking: number | null;
}

export interface Post {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption: string;
  createdAt: Date;
}

/**
 * Get paginated feed with all post data including likes, comments, and user ranking.
 *
 * `page` is 0-indexed (mesmo contrato da rota atual `api/posts/feed`): o cliente
 * (FeedClient) renderiza a página 0 via SSR e só chama esta API a partir de page=1,
 * então offset = page * limit (não (page - 1) * limit).
 */
export async function getFeed(
  currentUserId: string,
  page: number,
  limit = 10
): Promise<{ posts: FeedPost[]; hasMore: boolean }> {
  const db = getDb();

  // Enforce max limit of 50
  const finalLimit = Math.min(limit, 50);
  const offset = page * finalLimit;

  // First, calculate ranking for all users: sum points_delta per user, then rank by total
  const userPointsRaw = await db
    .select({
      userId: pointEvents.userId,
      totalPoints: sql<number>`CAST(COALESCE(SUM(${pointEvents.pointsDelta}), 0) AS INTEGER)`.as(
        'total_points'
      ),
    })
    .from(pointEvents)
    .groupBy(pointEvents.userId);

  // Get unique sorted point values for dense ranking
  const sortedPoints = Array.from(new Set(userPointsRaw.map((r) => r.totalPoints)))
    .sort((a, b) => b - a);

  // Build ranking map
  const userRankingMap = new Map<string, number>();
  for (let i = 0; i < sortedPoints.length; i++) {
    for (const { userId, totalPoints } of userPointsRaw) {
      if (totalPoints === sortedPoints[i]) {
        userRankingMap.set(userId, i + 1);
      }
    }
  }

  // Query posts with pagination (without isLiked - will calculate separately)
  const postRecords = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      mediaUrl: posts.mediaUrl,
      mediaType: posts.mediaType,
      caption: posts.caption,
      createdAt: posts.createdAt,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
      // Count likes for this post
      likesCount: sql<number>`CAST(COUNT(DISTINCT ${likes.id}) AS INTEGER)`.as(
        'likes_count'
      ),
      // Count comments for this post
      commentsCount: sql<number>`CAST(COUNT(DISTINCT ${comments.id}) AS INTEGER)`.as(
        'comments_count'
      ),
    })
    .from(posts)
    .innerJoin(users, eq(posts.userId, users.id))
    .leftJoin(likes, eq(likes.postId, posts.id))
    .leftJoin(comments, eq(comments.postId, posts.id))
    .groupBy(posts.id)
    .orderBy(desc(posts.createdAt))
    .limit(finalLimit + 1) // Fetch one extra to determine hasMore
    .offset(offset);

  // Extract hasMore and trim to finalLimit
  const hasMore = postRecords.length > finalLimit;
  const postsToReturn = postRecords.slice(0, finalLimit);

  // Get liked posts by current user
  const likedPostIds = await db
    .select({ postId: likes.postId })
    .from(likes)
    .where(eq(likes.userId, currentUserId));

  const likedPostIdSet = new Set(likedPostIds.map((l) => l.postId));

  // Build response with proper types and inject ranking
  const feedPosts: FeedPost[] = postsToReturn.map((record) => ({
    id: record.id,
    userId: record.userId,
    mediaUrl: record.mediaUrl,
    mediaType: record.mediaType as 'image' | 'video',
    caption: record.caption,
    createdAt: record.createdAt,
    user: {
      id: record.userId,
      name: record.userName,
      avatarUrl: record.userAvatarUrl,
    },
    likesCount: record.likesCount,
    commentsCount: record.commentsCount,
    isLiked: likedPostIdSet.has(record.id),
    userRanking: userRankingMap.get(record.userId) || null,
  }));

  return { posts: feedPosts, hasMore };
}
/**
 * Get all posts by a specific user without pagination.
 * Returns posts ordered by createdAt descending, with full FeedPost shape.
 */
export async function getUserPosts(
  userId: string,
  currentUserId: string
): Promise<FeedPost[]> {
  const db = getDb();

  // First, calculate ranking for all users: sum points_delta per user, then rank by total
  const userPointsRaw = await db
    .select({
      userId: pointEvents.userId,
      totalPoints: sql<number>`CAST(COALESCE(SUM(${pointEvents.pointsDelta}), 0) AS INTEGER)`.as(
        'total_points'
      ),
    })
    .from(pointEvents)
    .groupBy(pointEvents.userId);

  // Get unique sorted point values for dense ranking
  const sortedPoints = Array.from(new Set(userPointsRaw.map((r) => r.totalPoints)))
    .sort((a, b) => b - a);

  // Build ranking map
  const userRankingMap = new Map<string, number>();
  for (let i = 0; i < sortedPoints.length; i++) {
    for (const { userId: uid, totalPoints } of userPointsRaw) {
      if (totalPoints === sortedPoints[i]) {
        userRankingMap.set(uid, i + 1);
      }
    }
  }

  // Query posts for the specific user
  const postRecords = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      mediaUrl: posts.mediaUrl,
      mediaType: posts.mediaType,
      caption: posts.caption,
      createdAt: posts.createdAt,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
      // Count likes for this post
      likesCount: sql<number>`CAST(COUNT(DISTINCT ${likes.id}) AS INTEGER)`.as(
        'likes_count'
      ),
      // Count comments for this post
      commentsCount: sql<number>`CAST(COUNT(DISTINCT ${comments.id}) AS INTEGER)`.as(
        'comments_count'
      ),
    })
    .from(posts)
    .innerJoin(users, eq(posts.userId, users.id))
    .leftJoin(likes, eq(likes.postId, posts.id))
    .leftJoin(comments, eq(comments.postId, posts.id))
    .where(eq(posts.userId, userId))
    .groupBy(posts.id)
    .orderBy(desc(posts.createdAt));

  // Get liked posts by current user
  const likedPostIds = await db
    .select({ postId: likes.postId })
    .from(likes)
    .where(eq(likes.userId, currentUserId));

  const likedPostIdSet = new Set(likedPostIds.map((l) => l.postId));

  // Build response with proper types and inject ranking
  const feedPosts: FeedPost[] = postRecords.map((record) => ({
    id: record.id,
    userId: record.userId,
    mediaUrl: record.mediaUrl,
    mediaType: record.mediaType as 'image' | 'video',
    caption: record.caption,
    createdAt: record.createdAt,
    user: {
      id: record.userId,
      name: record.userName,
      avatarUrl: record.userAvatarUrl,
    },
    likesCount: record.likesCount,
    commentsCount: record.commentsCount,
    isLiked: likedPostIdSet.has(record.id),
    userRanking: userRankingMap.get(record.userId) || null,
  }));

  return feedPosts;
}
export async function createPost(
  userId: string,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  caption: string | null
): Promise<{
  post: Post;
  pointsAwarded: boolean;
  dailyPostsCount: number;
}> {
  const db = getDb();
  const today = getTodayInBrazil();

  // Fetch all posts by this user (we'll filter by date in code)
  const userPostsToday = await db
    .select({ id: posts.id, createdAt: posts.createdAt })
    .from(posts)
    .where(eq(posts.userId, userId));

  // Count posts created today (in BRT) by filtering in JavaScript
  const dailyPostsCount = userPostsToday.filter(
    (p) => getDateInBrazil(p.createdAt) === today
  ).length;

  // Create the post
  const postId = crypto.randomUUID();
  const now = new Date();

  await db.insert(posts).values({
    id: postId,
    userId,
    mediaUrl,
    mediaType,
    caption: caption || '',
    createdAt: now,
  });

  // Award points only if this is the first post of the day
  let pointsAwarded = false;
  if (dailyPostsCount === 0) {
    await db.insert(pointEvents).values({
      id: crypto.randomUUID(),
      userId,
      eventDate: today,
      source: 'post',
      pointsDelta: 1,
      postId,
      createdAt: now,
    });
    pointsAwarded = true;
  }

  const post: Post = {
    id: postId,
    userId,
    mediaUrl,
    mediaType,
    caption: caption || '',
    createdAt: now,
  };

  return {
    post,
    pointsAwarded,
    dailyPostsCount: dailyPostsCount + 1,
  };
}

/**
 * Delete a post and reallocate points if necessary.
 * Returns {deleted: true} on success, {deleted: false, reason} on failure.
 */
export async function deletePost(
  postId: string,
  userId: string
): Promise<{ deleted: boolean; reason?: string }> {
  const db = getDb();

  // Check if post exists and belongs to userId
  const post = await db
    .select({ id: posts.id, userId: posts.userId, createdAt: posts.createdAt })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (post.length === 0) {
    return { deleted: false, reason: 'not_found_or_forbidden' };
  }

  if (post[0].userId !== userId) {
    return { deleted: false, reason: 'not_found_or_forbidden' };
  }

  const postDateBrazil = getDateInBrazil(new Date(post[0].createdAt));

  // Delete the post
  await db.delete(posts).where(eq(posts.id, postId));

  // Fetch posts remaining from the same day
  const remainingDayPosts = await db
    .select({ id: posts.id, createdAt: posts.createdAt })
    .from(posts)
    .where(
      and(
        eq(posts.userId, userId),
        gte(
          posts.createdAt,
          new Date(`${postDateBrazil}T00:00:00-03:00`)
        ),
        lt(
          posts.createdAt,
          new Date(`${postDateBrazil}T23:59:59.999-03:00`)
        )
      )
    )
    .orderBy(posts.createdAt);

  if (remainingDayPosts.length === 0) {
    // No posts remaining for the day — check if we should remove the point
    const dayEvents = await db
      .select({ pointsDelta: pointEvents.pointsDelta })
      .from(pointEvents)
      .where(
        and(
          eq(pointEvents.userId, userId),
          eq(pointEvents.eventDate, postDateBrazil),
          eq(pointEvents.source, 'post')
        )
      );

    const daySum = dayEvents.reduce((acc, e) => acc + e.pointsDelta, 0);

    if (daySum > 0) {
      // Insert negative point event
      await db.insert(pointEvents).values({
        id: crypto.randomUUID(),
        userId,
        eventDate: postDateBrazil,
        source: 'post',
        pointsDelta: -1,
        postId: null,
        createdAt: new Date(),
        notes: `post deleted (id=${postId})`,
      });
    }
  } else {
    // Posts remaining — reallocate orphan point event to oldest remaining post
    const orphanEvent = await db
      .select({ id: pointEvents.id })
      .from(pointEvents)
      .where(
        and(
          eq(pointEvents.userId, userId),
          eq(pointEvents.eventDate, postDateBrazil),
          eq(pointEvents.source, 'post'),
          eq(pointEvents.pointsDelta, 1),
          isNull(pointEvents.postId)
        )
      )
      .limit(1);

    if (orphanEvent.length > 0) {
      await db
        .update(pointEvents)
        .set({
          postId: remainingDayPosts[0].id,
          notes: `relinked after delete of ${postId}`,
        })
        .where(eq(pointEvents.id, orphanEvent[0].id));
    }
  }

  return { deleted: true };
}
