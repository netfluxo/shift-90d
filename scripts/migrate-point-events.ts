/**
 * Migração histórica para point_events.
 *
 * Etapa A (automática): reconstrói eventos de post a partir da tabela posts.
 * Etapa B (manual):     preencha saturdayAttendance e compensations abaixo.
 *
 * Pré-requisitos:
 *   1. Rodar scripts/backup-points.ts
 *   2. Executar supabase/migrations/add-point-events.sql no Supabase dashboard
 *   3. Preencher saturdayAttendance e compensations abaixo
 *
 * Usage: npx ts-node scripts/migrate-point-events.ts
 *
 * Rollback: DELETE FROM public.point_events;
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (service role para bypassar RLS)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// ETAPA B — PREENCHER MANUALMENTE
// ─────────────────────────────────────────────────────────────────────────────

// Sábados presenciais com pontuação manual: 21/02, 28/02, 07/03, 14/03, 21/03.
// Programa de ponto presencial começou em 21/02/2026.
// Último registro manual: 22/03 (depois do sábado 21/03).
const ALL_FIVE = ['2026-02-21', '2026-02-28', '2026-03-07', '2026-03-14', '2026-03-21'];

const saturdayAttendance: Array<{ user_name: string; dates: string[] }> = [
  { user_name: 'ZILDA MARIA DE ANDRADE',        dates: ALL_FIVE },
  { user_name: 'Joseane Resende',               dates: ALL_FIVE },
  { user_name: 'Kojak',                         dates: ALL_FIVE },
  { user_name: 'Geovani Gois',                  dates: ALL_FIVE },
  { user_name: 'Aline Dantas',                  dates: ALL_FIVE },
  { user_name: 'TAYANE COSTA SANTOS REZENDE',   dates: ALL_FIVE },
  { user_name: 'Letícia Mendonça Costa',        dates: ALL_FIVE },
  { user_name: 'ANDREA SANTOS',                 dates: ALL_FIVE },
  { user_name: 'Tati Reis',                     dates: ALL_FIVE },
  // Gabriel faltou 28/02 (último sábado de fevereiro)
  { user_name: 'Gabriel Bitencourt',            dates: ['2026-02-21', '2026-03-07', '2026-03-14', '2026-03-21'] },
  // Jaqueline foi apenas em 07/03
  { user_name: 'Jaqueline Pereira',             dates: ['2026-03-07'] },
];

// Sem compensações — o usuário confirmou que não fez compensação.
const compensations: Array<{ user_name: string; date: string; notes: string }> = [];

// ─────────────────────────────────────────────────────────────────────────────

function toBRTDate(isoString: string): string {
  const ms = new Date(isoString).getTime();
  return new Date(ms - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// Supabase retorna no máximo 1000 linhas por query por padrão — paginar manualmente.
async function fetchAll<T>(
  table: string,
  columns: string
): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  console.log('=== Migração histórica de point_events ===\n');

  // Busca usuários e posts (com paginação — default do Supabase é 1000)
  const users = await fetchAll<{ id: string; name: string; points: number }>(
    'users',
    'id, name, points'
  );
  const posts = await fetchAll<{ id: string; user_id: string; created_at: string }>(
    'posts',
    'id, user_id, created_at'
  );

  console.log(`  ${users.length} usuários | ${posts.length} posts totais na tabela`);

  const userByName = new Map(users.map(u => [u.name.trim(), u]));

  // ── Etapa A: eventos de post ────────────────────────────────────────────────
  console.log('Etapa A: reconstruindo eventos de post...');

  const postEvents: object[] = [];
  const seenUserDay = new Set<string>();

  for (const post of posts) {
    const day = toBRTDate(post.created_at);
    const key = `${post.user_id}_${day}`;
    if (!seenUserDay.has(key)) {
      seenUserDay.add(key);
      postEvents.push({
        user_id:      post.user_id,
        event_date:   day,
        source:       'post',
        points_delta: 1,
        post_id:      post.id,
      });
    }
  }

  console.log(`  ${postEvents.length} eventos de post a inserir`);

  // Insere em lotes (Supabase tem limite de payload por request)
  const BATCH_SIZE = 500;
  for (let i = 0; i < postEvents.length; i += BATCH_SIZE) {
    const batch = postEvents.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('point_events').insert(batch);
    if (error) throw new Error(`Erro ao inserir eventos de post (lote ${i}): ${error.message}`);
  }
  console.log('  OK\n');

  // ── Etapa B: sábados ────────────────────────────────────────────────────────
  console.log('Etapa B: inserindo presenças de sábado...');

  if (saturdayAttendance.length === 0) {
    console.log('  AVISO: saturdayAttendance está vazio — preencha o array no script e rode novamente.\n');
  } else {
    const saturdayEvents: object[] = [];
    for (const entry of saturdayAttendance) {
      const user = userByName.get(entry.user_name.trim());
      if (!user) {
        console.warn(`  AVISO: usuário não encontrado: "${entry.user_name}"`);
        continue;
      }
      for (const date of entry.dates) {
        saturdayEvents.push({
          user_id:      user.id,
          event_date:   date,
          source:       'saturday_attendance',
          points_delta: 1,
        });
      }
    }
    if (saturdayEvents.length > 0) {
      const { error } = await supabase.from('point_events').insert(saturdayEvents);
      if (error) throw new Error(`Erro ao inserir eventos de sábado: ${error.message}`);
      console.log(`  ${saturdayEvents.length} eventos de sábado inseridos — OK\n`);
    }
  }

  // ── Etapa B: compensações ───────────────────────────────────────────────────
  console.log('Etapa B: inserindo compensações...');

  if (compensations.length === 0) {
    console.log('  AVISO: compensations está vazio — preencha o array no script e rode novamente.\n');
  } else {
    const compEvents: object[] = [];
    for (const comp of compensations) {
      const user = userByName.get(comp.user_name.trim());
      if (!user) {
        console.warn(`  AVISO: usuário não encontrado: "${comp.user_name}"`);
        continue;
      }
      compEvents.push({
        user_id:      user.id,
        event_date:   comp.date,
        source:       'compensation',
        points_delta: 1,
        notes:        comp.notes,
      });
    }
    if (compEvents.length > 0) {
      const { error } = await supabase.from('point_events').insert(compEvents);
      if (error) throw new Error(`Erro ao inserir compensações: ${error.message}`);
      console.log(`  ${compEvents.length} compensações inseridas — OK\n`);
    }
  }

  // ── Validação ───────────────────────────────────────────────────────────────
  console.log('Validação: comparando SUM(points_delta) vs users.points...\n');

  const events = await fetchAll<{ user_id: string; points_delta: number }>(
    'point_events',
    'user_id, points_delta'
  );

  const sumByUser = new Map<string, number>();
  for (const e of events) {
    sumByUser.set(e.user_id, (sumByUser.get(e.user_id) ?? 0) + e.points_delta);
  }

  let divergencias = 0;
  for (const user of users) {
    const sum = sumByUser.get(user.id) ?? 0;
    if (sum !== user.points) {
      divergencias++;
      console.log(`  DIVERGÊNCIA: ${user.name} — users.points=${user.points} | sum(events)=${sum} | diff=${user.points - sum}`);
    }
  }

  if (divergencias === 0) {
    console.log('  Todos os usuários batem — migração completa!');
  } else {
    console.log(`\n  ${divergencias} divergência(s). Provavelmente faltam entradas em saturdayAttendance ou compensations.`);
  }
}

main().catch((err) => {
  console.error('Erro na migração:', err);
  process.exit(1);
});
