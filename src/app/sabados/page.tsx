import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import SabadosTable from '@/components/sabados/SabadosTable';
import AddSabadoButton from '@/components/sabados/AddSabadoButton';
import { getAuth } from '@/lib/auth/server';
import { getPointEventsWithUsers } from '@/lib/db/queries/point-events';
import { getAllUsersBasic } from '@/lib/db/queries/users';

export const dynamic = 'force-dynamic';

export default async function SabadosPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session) {
    redirect('/login');
  }

  const isAdmin = session.user.email === 'admin@admin.com';

  const [rows, users] = await Promise.all([
    getPointEventsWithUsers({ source: 'saturday_attendance' }),
    getAllUsersBasic(),
  ]);

  return (
    <div className="min-h-screen pb-20">
      <Header subtitle="Sábados" />
      <main className="max-w-lg mx-auto px-4 py-6">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-medium text-muted-foreground">Presenças registradas</span>
            {isAdmin && <AddSabadoButton users={users} />}
          </div>
          <SabadosTable rows={rows} isAdmin={isAdmin} />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
