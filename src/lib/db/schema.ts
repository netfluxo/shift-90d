import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// SPEC_DEVIATION: sem coluna `points` armazenada.
// Reason: a migration original do Supabase (add-user-points-view.sql) usa
// point_events como fonte de verdade — points = SUM(points_delta), active_days =
// COUNT(DISTINCT event_date WHERE source='post'). Um campo `points` aqui ficaria
// dessincronizado. Ranking/perfil computam via agregação em point_events (ver
// src/lib/db/queries/users.ts).
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  avatarUrl: text('avatar_url'),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    mediaUrl: text('media_url').notNull(),
    mediaType: text('media_type', { enum: ['image', 'video'] }).notNull(),
    caption: text('caption').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    // Feed: keyset scan index-ordered. `id` como tiebreaker porque created_at é
    // timestamp em segundos e empata (seed/bulk), o que pularia ou duplicaria post.
    index('idx_posts_created_id').on(t.createdAt, t.id),
    // Posts de um usuário (perfil, streak, contagem do dia).
    index('idx_posts_user_created').on(t.userId, t.createdAt),
  ]
);

export const likes = sqliteTable(
  'likes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    // cascade: apagar o post remove seus likes (D1 força FK; sem isso o delete falha).
    postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('idx_likes_post').on(t.postId),
    // UNIQUE: sem ele o join do feed varria a tabela inteira por post. Também fecha
    // a race do read-then-write em toggleLike (ver onConflictDoNothing lá).
    uniqueIndex('idx_likes_user_post').on(t.userId, t.postId),
  ]
);

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    // cascade: apagar o post remove seus comentários.
    postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('idx_comments_post').on(t.postId)]
);

export const pointEvents = sqliteTable(
  'point_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    eventDate: text('event_date').notNull(),
    source: text('source', { enum: ['post', 'saturday_attendance', 'compensation'] }).notNull(),
    pointsDelta: integer('points_delta').notNull(),
    // set null: apagar o post zera o vínculo (o evento de ponto persiste); a lógica
    // de deletePost relinka o evento órfão ou insere o -1 compensatório.
    postId: text('post_id').references(() => posts.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('idx_pe_user').on(t.userId),
    // Recompute dos triggers de user_points e a checagem de dia em deletePost.
    index('idx_pe_user_date_source').on(t.userId, t.eventDate, t.source),
    // /sabados: filtro por source + range de event_date.
    index('idx_pe_source_date').on(t.source, t.eventDate),
  ]
);


// Better Auth tables
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  // Better Auth lista/revoga sessões por userId — sem índice era full scan (180 rows).
  (t) => [index('idx_sessions_user').on(t.userId)]
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  // Login busca a account por userId — sem índice era full scan (60 rows).
  (t) => [index('idx_accounts_user').on(t.userId)]
);

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
