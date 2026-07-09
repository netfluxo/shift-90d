import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { comments, posts, users } from '../schema';

export interface CommentWithUser {
  id: string;
  user_id: string;
  post_id: string;
  content: string;
  created_at: Date;
  user: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

/**
 * Check if a post exists
 */
export async function postExists(postId: string): Promise<boolean> {
  const db = getDb();

  const result = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  return result.length > 0;
}

/**
 * Create a comment and return it with user data
 */
export async function createComment(
  userId: string,
  postId: string,
  content: string
): Promise<CommentWithUser> {
  const db = getDb();

  const commentId = crypto.randomUUID();
  const now = new Date();

  // Insert comment
  await db.insert(comments).values({
    id: commentId,
    userId,
    postId,
    content,
    createdAt: now,
  });

  // Fetch comment with user data
  const result = await db
    .select({
      id: comments.id,
      userId: comments.userId,
      postId: comments.postId,
      content: comments.content,
      createdAt: comments.createdAt,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.id, commentId));

  if (result.length === 0) {
    throw new Error('Failed to create comment');
  }

  const record = result[0];

  return {
    id: record.id,
    user_id: record.userId,
    post_id: record.postId,
    content: record.content,
    created_at: record.createdAt,
    user: {
      id: record.userId,
      name: record.userName,
      avatar_url: record.userAvatarUrl,
    },
  };
}

/**
 * Get all comments for a post, ordered by created_at ascending
 */
export async function getCommentsByPostId(
  postId: string
): Promise<CommentWithUser[]> {
  const db = getDb();

  const result = await db
    .select({
      id: comments.id,
      userId: comments.userId,
      postId: comments.postId,
      content: comments.content,
      createdAt: comments.createdAt,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.postId, postId))
    .orderBy(comments.createdAt);

  return result.map((record) => ({
    id: record.id,
    user_id: record.userId,
    post_id: record.postId,
    content: record.content,
    created_at: record.createdAt,
    user: {
      id: record.userId,
      name: record.userName,
      avatar_url: record.userAvatarUrl,
    },
  }));
}
