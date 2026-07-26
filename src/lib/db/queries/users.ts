import { eq, desc, gt, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { users, userPoints } from '../schema';

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
 * Busca um usuário específico com seus pontos.
 *
 * Lê de `user_points` (agregado mantido por trigger a partir de point_events —
 * ver migration 0003). A agregação equivalente sobre point_events custava 390
 * rows_read; aqui são 2.
 *
 * LEFT JOIN + COALESCE: o trigger em `users` garante a row, mas um banco
 * restaurado de dump antes do rebuild pode não tê-la. Não retornar null por isso.
 */
export async function getUserById(id: string): Promise<UserWithPoints | null> {
  const db = getDb();

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      points: sql<number>`COALESCE(${userPoints.points}, 0)`,
      activeDays: sql<number>`COALESCE(${userPoints.activeDays}, 0)`,
    })
    .from(users)
    .leftJoin(userPoints, eq(userPoints.userId, users.id))
    .where(eq(users.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Busca ranking de usuários com points > 0, ordenado por pontos decrescentes.
 *
 * Mesma semântica do HAVING anterior (`points > 0`), agora como WHERE sobre o
 * agregado materializado: 937 rows_read → 60.
 *
 * O dense ranking (posições com empate) continua em `buildDenseRankingMap`,
 * sobre o resultado desta query.
 */
export async function getRanking(limit = 100): Promise<UserWithPoints[]> {
  const db = getDb();

  return db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      points: userPoints.points,
      activeDays: userPoints.activeDays,
    })
    .from(userPoints)
    .innerJoin(users, eq(users.id, userPoints.userId))
    .where(gt(userPoints.points, 0))
    .orderBy(desc(userPoints.points))
    .limit(limit);
}
