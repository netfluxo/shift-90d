import { eq, and, gte, lte, lt, desc, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { pointEvents, posts, userPoints } from '../schema';
import { getTodayInBrazil, getDateInBrazil } from '@/lib/utils/timezone';

export interface PointEvent {
  id: string;
  user_id: string;
  event_date: string;
  source: 'post' | 'saturday_attendance' | 'compensation';
  points_delta: number;
  post_id: string | null;
  notes: string | null;
  created_at: Date;
}

export interface UserActivity {
  totalActiveDays: number;
  currentStreak: number;
  totalPoints: number;
  todayPosts: number;
  todayPoints: number;
}

/**
 * Create a point event
 */
export async function createPointEvent(
  userId: string,
  eventDate: string,
  source: 'post' | 'saturday_attendance' | 'compensation',
  pointsDelta: number,
  postId?: string
): Promise<void> {
  const db = getDb();

  await db.insert(pointEvents).values({
    id: crypto.randomUUID(),
    userId,
    eventDate,
    source,
    pointsDelta,
    postId: postId || null,
    createdAt: new Date(),
  });
}

/**
 * Delete a point event (only if source is 'saturday_attendance')
 */
export async function deletePointEvent(id: string): Promise<void> {
  const db = getDb();

  // Fetch the event to check its source
  const result = await db
    .select({ source: pointEvents.source })
    .from(pointEvents)
    .where(eq(pointEvents.id, id));

  if (result.length === 0) {
    throw new Error('Point event not found');
  }

  const event = result[0];

  // Only allow deletion if source is 'saturday_attendance'
  if (event.source !== 'saturday_attendance') {
    throw new Error('Can only delete point events with source "saturday_attendance"');
  }

  await db.delete(pointEvents).where(eq(pointEvents.id, id));
}

/**
 * Get point events with optional filters
 */
export async function getPointEvents(filters: {
  source?: 'post' | 'saturday_attendance' | 'compensation';
  dateFrom?: string;
  dateTo?: string;
}): Promise<PointEvent[]> {
  const db = getDb();

  const conditions = [];

  if (filters.source) {
    conditions.push(eq(pointEvents.source, filters.source));
  }

  if (filters.dateFrom) {
    conditions.push(gte(pointEvents.eventDate, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(pointEvents.eventDate, filters.dateTo));
  }

  const results = await db
    .select()
    .from(pointEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return results.map((row) => ({
    id: row.id,
    user_id: row.userId,
    event_date: row.eventDate,
    source: row.source,
    points_delta: row.pointsDelta,
    post_id: row.postId,
    notes: row.notes,
    created_at: row.createdAt,
  }));
}

/**
 * Get point events with user names (for SabadosTable)
 * Returns shape: { id, event_date, points_delta, users: { name } }
 */
export interface SabadoRowData {
  id: string;
  event_date: string;
  points_delta: number;
  users: { name: string };
}

export async function getPointEventsWithUsers(filters: {
  source?: 'post' | 'saturday_attendance' | 'compensation';
  dateFrom?: string;
  dateTo?: string;
}): Promise<SabadoRowData[]> {
  const db = getDb();
  const { users: usersTable } = await import('../schema');

  const conditions = [];

  if (filters.source) {
    conditions.push(eq(pointEvents.source, filters.source));
  }

  if (filters.dateFrom) {
    conditions.push(gte(pointEvents.eventDate, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(pointEvents.eventDate, filters.dateTo));
  }

  const results = await db
    .select({
      id: pointEvents.id,
      event_date: pointEvents.eventDate,
      points_delta: pointEvents.pointsDelta,
      user_name: usersTable.name,
    })
    .from(pointEvents)
    .innerJoin(usersTable, eq(pointEvents.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return results.map((row) => ({
    id: row.id,
    event_date: row.event_date,
    points_delta: row.points_delta,
    users: { name: row.user_name },
  }));
}

/**
 * Get user activity metrics including total points, active days, streak, and today's posts
 * Replicates the exact streak calculation from src/app/api/users/[userId]/activity/route.ts
 */
export async function getUserActivity(userId: string): Promise<UserActivity> {
  const db = getDb();

  const todayInBrazil = getTodayInBrazil();
  const startOfDayBrazil = new Date(todayInBrazil + 'T00:00:00-03:00');
  const endOfDayBrazil = new Date(todayInBrazil + 'T23:59:59.999-03:00');

  // O streak não pode ser maior que o programa (90 dias). Limitar a janela evita
  // que a leitura cresça com o histórico — antes trazia todos os posts do usuário
  // (393 rows_read) para derivar datas em JS.
  const streakWindowStart = new Date(
    startOfDayBrazil.getTime() - 100 * 24 * 60 * 60 * 1000
  );

  const [aggregate, todayPostsResult, userPosts] = await Promise.all([
    // points e activeDays saem do agregado materializado (trigger em point_events).
    // As duas agregações anteriores sobre point_events custavam 389 rows_read cada.
    db
      .select({ points: userPoints.points, activeDays: userPoints.activeDays })
      .from(userPoints)
      .where(eq(userPoints.userId, userId))
      .limit(1),
    db
      .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          // Operadores tipados (não sql`` cru): o Drizzle converte o Date para o
          // formato da coluna (timestamp em segundos). Passar Date dentro de sql``
          // quebra o bind no D1.
          gte(posts.createdAt, startOfDayBrazil),
          lt(posts.createdAt, endOfDayBrazil)
        )
      ),
    db
      .select({ createdAt: posts.createdAt })
      .from(posts)
      .where(
        and(eq(posts.userId, userId), gte(posts.createdAt, streakWindowStart))
      )
      .orderBy(desc(posts.createdAt)),
  ]);

  const totalPoints = aggregate[0]?.points ?? 0;
  const totalActiveDays = aggregate[0]?.activeDays ?? 0;
  const todayPosts =
    todayPostsResult.length > 0 ? todayPostsResult[0].count : 0;

  // Current streak: derived from posts, em JS. A conversão de fuso continua no
  // getDateInBrazil (Intl/America/Sao_Paulo) — fazer isso em SQL com um offset
  // fixo '-03:00' mudaria a semântica e medi que sai mais caro.

  let currentStreak = 0;

  if (userPosts.length > 0) {
    const uniqueDates = new Set<string>();
    userPosts.forEach((post) => {
      uniqueDates.add(getDateInBrazil(new Date(post.createdAt)));
    });

    if (uniqueDates.size > 0) {
      const sortedDates = Array.from(uniqueDates).sort().reverse();
      const today = new Date(todayInBrazil);
      const checkDate = new Date(today);

      if (!uniqueDates.has(todayInBrazil)) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      for (const dateStr of sortedDates) {
        const checkDateStr = checkDate.toISOString().split('T')[0];
        if (dateStr === checkDateStr) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (dateStr < checkDateStr) {
          break;
        }
      }
    }
  }

  return {
    totalActiveDays,
    currentStreak,
    totalPoints,
    todayPosts,
    todayPoints: Math.min(todayPosts, 1),
  };
}
