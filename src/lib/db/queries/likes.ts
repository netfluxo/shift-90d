import { eq, and, count } from 'drizzle-orm';
import { getDb } from '../client';
import { likes } from '../schema';

export async function toggleLike(
  userId: string,
  postId: string
): Promise<{ action: 'liked' | 'unliked'; likesCount: number }> {
  const db = getDb();

  const existing = await db
    .select()
    .from(likes)
    .where(and(eq(likes.userId, userId), eq(likes.postId, postId)))
    .limit(1);

  let action: 'liked' | 'unliked';

  if (existing.length > 0) {
    await db.delete(likes).where(eq(likes.id, existing[0].id));
    action = 'unliked';
  } else {
    // onConflictDoNothing: existe UNIQUE(user_id, post_id) desde a migration 0002.
    // O select acima é read-then-write, então dois toques simultâneos podem chegar
    // aqui juntos — sem isso o segundo viraria 500.
    await db
      .insert(likes)
      .values({
        id: crypto.randomUUID(),
        userId,
        postId,
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: [likes.userId, likes.postId] });
    action = 'liked';
  }

  const [{ value: likesCount }] = await db
    .select({ value: count() })
    .from(likes)
    .where(eq(likes.postId, postId));

  return { action, likesCount };
}
