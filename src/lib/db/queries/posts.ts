import { eq, desc, sql, and, gte, lt, isNull, or, count } from 'drizzle-orm';
import { getDb } from '../client';
import {
  posts,
  users,
  likes,
  comments,
  pointEvents,
} from '../schema';
import { getRanking } from './users';
import { buildDenseRankingMap } from '@/lib/utils/ranking';
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
 * Cursor de paginação keyset: `<createdAtEpochSeconds>_<postId>`.
 *
 * `id` é obrigatório como tiebreaker — `posts.created_at` é timestamp em segundos
 * e empata em seed/bulk insert, o que faria o scroll pular ou repetir post.
 */
export interface FeedCursor {
  createdAt: number;
  id: string;
}

export function encodeFeedCursor(createdAt: Date, id: string): string {
  return `${Math.floor(createdAt.getTime() / 1000)}_${id}`;
}

export function parseFeedCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  const sep = raw.indexOf('_');
  if (sep <= 0) return null;
  const createdAt = Number(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (!Number.isFinite(createdAt) || !id) return null;
  return { createdAt, id };
}

/**
 * Contagens e flag de like por post, como subqueries correlacionadas.
 *
 * Substituem o `LEFT JOIN likes/comments + GROUP BY posts.id`, que obrigava o
 * SQLite a agregar a tabela `posts` inteira antes do LIMIT — 2372 rows_read para
 * devolver 10 posts. Cada subquery aqui é um seek em índice coberto
 * (`idx_likes_post`, `idx_comments_post`, `idx_likes_user_post`): 22 rows_read
 * para a mesma página.
 *
 * `COUNT(*)` em vez de `COUNT(DISTINCT id)`: o DISTINCT só existia para desfazer a
 * multiplicação do join cartesiano, que deixou de existir.
 */
function postMetricColumns(currentUserId: string) {
  return {
    likesCount: sql<number>`(
      SELECT CAST(COUNT(*) AS INTEGER) FROM ${likes} WHERE ${likes.postId} = ${posts.id}
    )`,
    commentsCount: sql<number>`(
      SELECT CAST(COUNT(*) AS INTEGER) FROM ${comments} WHERE ${comments.postId} = ${posts.id}
    )`,
    isLiked: sql<number>`(
      SELECT EXISTS(
        SELECT 1 FROM ${likes}
        WHERE ${likes.postId} = ${posts.id} AND ${likes.userId} = ${currentUserId}
      )
    )`,
  };
}

interface PostMetricRow {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  createdAt: Date;
  userName: string;
  userAvatarUrl: string | null;
  likesCount: number;
  commentsCount: number;
  isLiked: number;
}

function toFeedPost(record: PostMetricRow, rankingMap: Map<string, number>): FeedPost {
  return {
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
    isLiked: record.isLiked === 1,
    userRanking: rankingMap.get(record.userId) ?? null,
  };
}

const postSelection = (currentUserId: string) => ({
  id: posts.id,
  userId: posts.userId,
  mediaUrl: posts.mediaUrl,
  mediaType: posts.mediaType,
  caption: posts.caption,
  createdAt: posts.createdAt,
  userName: users.name,
  userAvatarUrl: users.avatarUrl,
  ...postMetricColumns(currentUserId),
});

/**
 * Feed paginado.
 *
 * Paginação keyset por `(created_at, id)` via `idx_posts_created_id`: custo
 * constante por página, ao contrário do OFFSET, que crescia com a profundidade do
 * scroll. `page` continua aceito como fallback para clientes que ainda estavam com
 * a versão anterior carregada durante o deploy.
 *
 * O ranking vem de `getRanking()` (60 rows de `user_points`) em vez de agregar
 * `point_events` por request. Isso também alinha o feed com `/ranking`: antes o
 * feed atribuía posição a usuário com 0 pontos, que a página de ranking não lista.
 */
export async function getFeed(
  currentUserId: string,
  options: { cursor?: string | null; page?: number; limit?: number } = {}
): Promise<{ posts: FeedPost[]; hasMore: boolean; nextCursor: string | null }> {
  const db = getDb();

  const finalLimit = Math.min(options.limit ?? 10, 50);
  const cursor = parseFeedCursor(options.cursor);
  // Offset só entra no caminho legado (sem cursor).
  const offset = cursor ? 0 : Math.max(options.page ?? 0, 0) * finalLimit;

  const cursorDate = cursor ? new Date(cursor.createdAt * 1000) : null;
  const keysetFilter =
    cursor && cursorDate
      ? or(
          lt(posts.createdAt, cursorDate),
          and(eq(posts.createdAt, cursorDate), lt(posts.id, cursor.id))
        )
      : undefined;

  const [rankingRows, postRecords] = await Promise.all([
    getRanking(),
    db
      .select(postSelection(currentUserId))
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(keysetFilter)
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(finalLimit + 1) // +1 revela se existe próxima página
      .offset(offset),
  ]);

  const hasMore = postRecords.length > finalLimit;
  const postsToReturn = postRecords.slice(0, finalLimit);

  const rankingMap = buildDenseRankingMap(rankingRows);
  const feedPosts = postsToReturn.map((record) => toFeedPost(record, rankingMap));

  const last = postsToReturn[postsToReturn.length - 1];
  const nextCursor = hasMore && last ? encodeFeedCursor(last.createdAt, last.id) : null;

  return { posts: feedPosts, hasMore, nextCursor };
}

/**
 * Todos os posts de um usuário, sem paginação (usado no perfil).
 *
 * `rankingRows` é opcional para a página de perfil poder reaproveitar o ranking que
 * já buscou — antes o ranking global era recomputado aqui, dobrando o custo.
 */
export async function getUserPosts(
  userId: string,
  currentUserId: string,
  rankingRows?: { id: string; points: number }[]
): Promise<FeedPost[]> {
  const db = getDb();

  const [ranking, postRecords] = await Promise.all([
    rankingRows ? Promise.resolve(rankingRows) : getRanking(),
    db
      .select(postSelection(currentUserId))
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(eq(posts.userId, userId))
      // Sem tiebreaker por id: não há paginação aqui, e incluí-lo forçava
      // "USE TEMP B-TREE FOR LAST TERM OF ORDER BY" sobre idx_posts_user_created.
      .orderBy(desc(posts.createdAt)),
  ]);

  const rankingMap = buildDenseRankingMap(ranking);
  return postRecords.map((record) => toFeedPost(record, rankingMap));
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

  // Conta os posts de hoje no próprio SQL. Antes trazia todos os posts do usuário
  // para filtrar por data em JS (392 rows_read); agora é 1 seek em
  // idx_posts_user_created.
  const [{ value: dailyPostsCount }] = await db
    .select({ value: count() })
    .from(posts)
    .where(
      and(
        eq(posts.userId, userId),
        gte(posts.createdAt, new Date(`${today}T00:00:00-03:00`)),
        lt(posts.createdAt, new Date(`${today}T23:59:59.999-03:00`))
      )
    );

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
    // user_points é atualizada pelo trigger point_events_after_insert.
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
