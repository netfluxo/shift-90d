'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { getColumns, getName, formatDate, type SabadoRow } from './columns';

export default function SabadosTable({
  rows,
  isAdmin,
}: {
  rows: SabadoRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'event_date', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const uniqueDates = Array.from(new Set(rows.map(r => r.event_date)))
    .sort((a, b) => b.localeCompare(a));

  const columns = getColumns(isAdmin, setConfirmId);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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

  const dateFilterValue = (table.getColumn('event_date')?.getFilterValue() as string) ?? '';
  const nameFilterValue = (table.getColumn('name')?.getFilterValue() as string) ?? '';

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
            <Button variant="destructive" onClick={handleDelete} disabled={!!deleting}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Select
          value={dateFilterValue || 'all'}
          onValueChange={v => table.getColumn('event_date')?.setFilterValue(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {uniqueDates.map(d => (
              <SelectItem key={d} value={d}>{formatDate(d)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Filtrar usuário..."
          value={nameFilterValue}
          onChange={e => table.getColumn('name')?.setFilterValue(e.target.value)}
          className="max-w-48"
        />
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(hg => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map(header => (
                <TableHead key={header.id} className={header.column.id === 'event_date' ? 'pl-2' : header.column.id === 'actions' ? 'w-10' : ''}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                Nenhum registro encontrado.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map(row => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <TableCell
                    key={cell.id}
                    className={
                      cell.column.id === 'event_date' ? 'pl-4' :
                      cell.column.id === 'actions' ? 'pr-2 text-right' : ''
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}
