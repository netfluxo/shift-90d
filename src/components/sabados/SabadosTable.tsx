'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

type Row = {
  id: string;
  event_date: string;
  points_delta: number;
  users: { name: string } | { name: string }[] | null;
};

type SortKey = 'event_date' | 'name';
type SortDir = 'asc' | 'desc';

function getName(users: Row['users']): string {
  if (!users) return '';
  if (Array.isArray(users)) return users[0]?.name ?? '';
  return users.name;
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export default function SabadosTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('event_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'event_date') cmp = a.event_date.localeCompare(b.event_date);
    else cmp = getName(a.users).localeCompare(getName(b.users));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const confirmRow = rows.find(r => r.id === confirmId);

  // Assign a group index per unique date (for zebra striping)
  const dateGroupIndex: Record<string, number> = {};
  let groupCounter = 0;
  for (const row of sorted) {
    if (!(row.event_date in dateGroupIndex)) {
      dateGroupIndex[row.event_date] = groupCounter++;
    }
  }

  async function handleDelete() {
    if (!confirmId) return;
    setDeleting(confirmId);
    setConfirmId(null);
    await fetch('/api/sabados', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: confirmId }),
    });
    setDeleting(null);
    router.refresh();
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (k !== sortKey) return <span className="ml-1 text-muted-foreground/40">↕</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <>
    <Dialog open={!!confirmId} onOpenChange={v => { if (!v) setConfirmId(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remover presença</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Remover <span className="font-medium text-foreground">{getName(confirmRow?.users ?? null)}</span> do sábado{' '}
          <span className="font-medium text-foreground">{confirmRow ? formatDate(confirmRow.event_date) : ''}</span>?
          <br />Esta ação não pode ser desfeita.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmId(null)}>Cancelar</Button>
          <Button variant="destructive" onClick={handleDelete}>Remover</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="cursor-pointer select-none pl-4 hover:text-foreground" onClick={() => handleSort('event_date')}>
            Data <SortIcon k="event_date" />
          </TableHead>
          <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('name')}>
            Usuário <SortIcon k="name" />
          </TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
              Nenhum registro encontrado.
            </TableCell>
          </TableRow>
        )}
        {sorted.map((row) => {
          const isEvenGroup = dateGroupIndex[row.event_date] % 2 === 0;
          return (
            <TableRow key={row.id} className={isEvenGroup ? '' : 'bg-muted/40 hover:bg-muted/60'}>
              <TableCell className="pl-4 text-muted-foreground whitespace-nowrap">
                {formatDate(row.event_date)}
              </TableCell>
              <TableCell className="font-medium">
                {getName(row.users) || '—'}
              </TableCell>
              <TableCell className="pr-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={deleting === row.id}
                  onClick={() => setConfirmId(row.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </>
  );
}
