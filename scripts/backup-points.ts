/**
 * Exporta snapshot de users.points e user_activity para backups/points-YYYY-MM-DD.json
 * Rodar ANTES de qualquer migration de pontos.
 *
 * Usage: npx ts-node scripts/backup-points.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('Exportando snapshot de pontos...');

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, name, points, created_at')
    .order('points', { ascending: false });

  if (usersError) throw usersError;

  const { data: activity, error: activityError } = await supabase
    .from('user_activity')
    .select('*')
    .order('activity_date', { ascending: true });

  if (activityError) throw activityError;

  const snapshot = {
    exported_at: new Date().toISOString(),
    users,
    user_activity: activity,
  };

  const dir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const date = new Date().toISOString().split('T')[0];
  const file = path.join(dir, `points-${date}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));

  console.log(`Backup salvo em: ${file}`);
  console.log(`Total usuários: ${users?.length ?? 0}`);
  console.log(`Total linhas user_activity: ${activity?.length ?? 0}`);
}

main().catch((err) => {
  console.error('Erro no backup:', err);
  process.exit(1);
});
