import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import SabadosTable from '@/components/sabados/SabadosTable';
import AddSabadoButton from '@/components/sabados/AddSabadoButton';

export default async function SabadosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const isAdmin = user.email === 'admin@admin.com';

  const [{ data: rows }, { data: users }] = await Promise.all([
    supabase
      .from('point_events')
      .select('id, event_date, points_delta, users(name)')
      .eq('source', 'saturday_attendance')
      .order('event_date', { ascending: false }),
    supabase
      .from('user_points_view')
      .select('id, name, points')
      .order('points', { ascending: false }),
  ]);

  return (
    <div className="min-h-screen pb-20">
      <Header subtitle="Sábados" />
      <main className="max-w-lg mx-auto px-4 py-6">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-medium text-muted-foreground">Presenças registradas</span>
            {isAdmin && <AddSabadoButton users={users ?? []} />}
          </div>
          <SabadosTable rows={rows ?? []} />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
