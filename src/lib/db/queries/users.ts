import { eq, desc, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { users, pointEvents } from '../schema';

/**
 * Get all users (id, name only) regardless of points — for admin pickers
 * (e.g. AddSabadoButton) where a zero-point user must still be assignable.
 * Does NOT filter by points > 0, unlike getRanking().
 */
export async function getAllUsersBasic(): Promise<{ id: string; name: string }[]> {
  const db = getDb();
  return db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name);
}

export interface UserWithPoints {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  points: number;
  activeDays: number;
}

/**
 * Busca um usuário específico com agregação de pontos via point_events.
 *
 * Fórmula:
 * - `points` = SUM(points_delta) de TODOS os point_events do usuário
 * - `activeDays` = COUNT(DISTINCT event_date) apenas onde source='post'
 *
 * Se o usuário não tem eventos de ponto, retorna points=0 e activeDays=0.
 */
export async function getUserById(id: string): Promise<UserWithPoints | null> {
  const db = getDb();

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      points: sql<number>`COALESCE(SUM(${pointEvents.pointsDelta}), 0)`,
      activeDays: sql<number>`COALESCE(
        COUNT(DISTINCT
          CASE WHEN ${pointEvents.source} = 'post' THEN ${pointEvents.eventDate} ELSE NULL END
        ),
        0
      )`,
    })
    .from(users)
    .leftJoin(pointEvents, eq(users.id, pointEvents.userId))
    .where(eq(users.id, id))
    .groupBy(users.id);

  return result[0] || null;
}

/**
 * Busca ranking de usuários com points > 0, ordenado por pontos descrescentes.
 *
 * Fórmula:
 * - `points` = SUM(points_delta) de TODOS os point_events do usuário
 * - `activeDays` = COUNT(DISTINCT event_date) apenas onde source='post'
 *
 * Filtra points > 0 via HAVING (mesmo comportamento do ranking/page.tsx atual:
 * `.gt('points', 0)`).
 */
export async function getRanking(limit = 100): Promise<UserWithPoints[]> {
  const db = getDb();

  const pointsAlias = sql<number>`COALESCE(SUM(${pointEvents.pointsDelta}), 0)`;

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      points: pointsAlias,
      activeDays: sql<number>`COALESCE(
        COUNT(DISTINCT
          CASE WHEN ${pointEvents.source} = 'post' THEN ${pointEvents.eventDate} ELSE NULL END
        ),
        0
      )`,
    })
    .from(users)
    .leftJoin(pointEvents, eq(users.id, pointEvents.userId))
    .groupBy(users.id)
    .having(sql`${pointsAlias} > 0`)
    .orderBy(desc(pointsAlias))
    .limit(limit);

  return result;
}
