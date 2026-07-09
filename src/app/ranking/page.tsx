import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import RankingItem from '@/components/ranking/RankingItem';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import { User } from '@/lib/types';
import { buildDenseRankingMap } from '@/lib/utils/ranking';
import { getAuth } from '@/lib/auth/server';
import { getRanking } from '@/lib/db/queries/users';

export const dynamic = 'force-dynamic';

export default async function RankingPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect('/login');
  }

  const usersData = await getRanking(100);

  // Map UserWithPoints (camelCase) to User (snake_case) with active_days
  const users = usersData.map((u) => ({
    id: u.id,
    name: u.name,
    avatar_url: u.avatarUrl,
    created_at: u.createdAt.toISOString(),
    points: u.points,
    active_days: u.activeDays,
  })) as (User & { active_days?: number })[];

  const rankingMap = buildDenseRankingMap(usersData);

  return (
    <div className="pb-20">
      {/* Header */}
      <Header subtitle="Ranking" />

      {/* Ranking List */}
      <div className="divide-y divide-gray-100">
        {!users || users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <TrophyIcon className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Ranking vazio</h2>
            <p className="text-gray-500">Comece a treinar para aparecer aqui!</p>
          </div>
        ) : (
          users.map((u: User) => (
            <RankingItem key={u.id} user={u} position={rankingMap.get(u.id) || 0} />
          ))
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}
