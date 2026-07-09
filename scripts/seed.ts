/**
 * Gera o SQL de seed inicial para o D1 (banco limpo).
 *
 * Cria 1 usuário admin com login por email/senha via Better Auth. A senha é
 * hasheada com `hashPassword` do próprio Better Auth (scrypt) — hand-rolling o
 * hash quebraria o login, então usamos a mesma função que o runtime usa.
 *
 * Convenção do Better Auth para credentials (ver dist/api/routes/sign-up.mjs):
 *   - linha em `users`: id, name, email, emailVerified, createdAt, updatedAt
 *   - linha em `accounts`: providerId='credential', accountId=<userId>, password=<hash>
 *
 * Uso:
 *   SEED_ADMIN_EMAIL=admin@admin.com SEED_ADMIN_PASSWORD='troque-isto' \
 *   SEED_ADMIN_NAME='Admin' npx tsx scripts/seed.ts
 *
 * Depois aplique o SQL gerado:
 *   local:  npx wrangler d1 execute DB --local  --file=./scripts/seed.sql
 *   remoto: npx wrangler d1 execute DB --remote --file=./scripts/seed.sql
 */

import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@admin.com';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
const name = process.env.SEED_ADMIN_NAME ?? 'Admin';

// Aviso: a senha default só serve para dev local. Em produção passe SEED_ADMIN_PASSWORD.
if (!process.env.SEED_ADMIN_PASSWORD) {
  console.warn(
    '⚠  SEED_ADMIN_PASSWORD não definido — usando senha default "admin123" (apenas dev).'
  );
}

function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const userId = randomUUID();
  const accountId = randomUUID();
  const hash = await hashPassword(password);
  // Drizzle integer({ mode: 'timestamp' }) armazena segundos Unix.
  const now = Math.floor(Date.now() / 1000);

  const sql = `-- Seed gerado por scripts/seed.ts — banco D1 limpo
-- Admin: ${email}
INSERT INTO users (id, name, email, email_verified, avatar_url, image, created_at, updated_at)
VALUES (${sqlStr(userId)}, ${sqlStr(name)}, ${sqlStr(email)}, 1, NULL, NULL, ${now}, ${now});

INSERT INTO accounts (id, user_id, provider_id, account_id, password, created_at, updated_at)
VALUES (${sqlStr(accountId)}, ${sqlStr(userId)}, 'credential', ${sqlStr(userId)}, ${sqlStr(hash)}, ${now}, ${now});
`;

  const outPath = join(process.cwd(), 'scripts', 'seed.sql');
  writeFileSync(outPath, sql, 'utf8');

  console.log(`✓ SQL de seed escrito em: ${outPath}`);
  console.log(`  Admin: ${email} (userId=${userId})`);
  console.log('\nAplique com:');
  console.log('  local:  npx wrangler d1 execute DB --local  --file=./scripts/seed.sql');
  console.log('  remoto: npx wrangler d1 execute DB --remote --file=./scripts/seed.sql');
}

main().catch((err) => {
  console.error('Erro ao gerar seed:', err);
  process.exit(1);
});
