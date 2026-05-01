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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

type Row = {
  id: string;
  event_date: string;
  points_delta: number;
  users: { name: string } | { name: string }[] | null;
};

type SortKey = 'name';
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

export default function SabadosTable({ rows, isAdmin }: { rows: Row[]; isAdmin: boolean }) {
  const router = useRouter();

  const uniqueDates = Array.from(new Set(rows.map(r => r.event_date)))
    .sort((a, b) => b.localeCompare(a));

  const [selectedDate, setSelectedDate] = useState<string>(uniqueDates[0] ?? '');
  const [sortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = rows
    .filter(r => r.event_date === selectedDate)
    .sort((a, b) => {
      const cmp = getName(a.users).localeCompare(getName(b.users));
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const confirmRow = rows.find(r => r.id === confirmId);

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

      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Select value={selectedDate} onValueChange={v => setSelectedDate(v ?? '')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {uniqueDates.map(d => (
              <SelectItem key={d} value={d}>{formatDate(d)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          className="text-xs text-muted-foreground hover:text-foreground select-none"
          onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
        >
          Usuário {sortDir === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      <Table>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground py-10">
                Nenhum registro para este sábado.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="pl-4 font-medium">
                {getName(row.users) || '—'}
              </TableCell>
              {isAdmin && (
                <TableCell className="pr-2 text-right">
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
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
