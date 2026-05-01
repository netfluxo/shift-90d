'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, ListFilter, X } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getFacetedUniqueValues,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type FilterFn,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

type Row = {
  id: string;
  event_date: string;
  points_delta: number;
  users: { name: string } | { name: string }[] | null;
};

function getName(users: Row['users']): string {
  if (!users) return '';
  if (Array.isArray(users)) return users[0]?.name ?? '';
  return users.name;
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

const dateFilter: FilterFn<Row> = (row, _colId, filterValue: string) =>
  !filterValue || row.original.event_date === filterValue;

const nameFilter: FilterFn<Row> = (row, _colId, filterValue: string) =>
  getName(row.original.users).toLowerCase().includes(filterValue.toLowerCase());

export default function SabadosTable({ rows, isAdmin }: { rows: Row[]; isAdmin: boolean }) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'event_date', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const uniqueDates = Array.from(new Set(rows.map(r => r.event_date))).sort((a, b) => b.localeCompare(a));

  const columns: ColumnDef<Row>[] = [
    {
      id: 'event_date',
      accessorFn: r => r.event_date,
      header: 'Data',
      filterFn: dateFilter,
      cell: ({ row }) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {formatDate(row.original.event_date)}
        </span>
      ),
    },
    {
      id: 'name',
      accessorFn: r => getName(r.users),
      header: 'Usuário',
      filterFn: nameFilter,
      cell: ({ row }) => (
        <span className="font-medium">{getName(row.original.users) || '—'}</span>
      ),
    },
    ...(isAdmin ? [{
      id: 'actions',
      header: '',
      cell: ({ row }: { row: { original: Row } }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={deleting === row.original.id}
          onClick={() => setConfirmId(row.original.id)}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    } as ColumnDef<Row>] : []),
  ];

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
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

  function getFilterValue(colId: string) {
    return (columnFilters.find(f => f.id === colId)?.value as string) ?? '';
  }

  function setFilter(colId: string, value: string) {
    setColumnFilters(prev =>
      value
        ? [...prev.filter(f => f.id !== colId), { id: colId, value }]
        : prev.filter(f => f.id !== colId)
    );
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
          {table.getHeaderGroups().map(hg => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map(header => {
                const colId = header.column.id;
                const isFilterable = colId === 'event_date' || colId === 'name';
                const activeFilter = getFilterValue(colId);

                return (
                  <TableHead
                    key={header.id}
                    className={colId === 'event_date' ? 'pl-4' : colId === 'actions' ? 'w-10' : ''}
                  >
                    {!isFilterable ? null : (
                      <div className="flex items-center gap-1">
                        <span
                          className="cursor-pointer select-none hover:text-foreground"
                          onClick={() => header.column.toggleSorting()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                        </span>

                        <Popover>
                          <PopoverTrigger
                            className={`rounded p-0.5 transition-colors hover:text-foreground ${activeFilter ? 'text-primary' : 'text-muted-foreground/40'}`}
                          >
                            <ListFilter className="size-3.5" />
                          </PopoverTrigger>
                          <PopoverContent className="w-52 p-2" align="start">
                            {colId === 'event_date' ? (
                              <div className="flex flex-col gap-1">
                                {activeFilter && (
                                  <button
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
                                    onClick={() => setFilter('event_date', '')}
                                  >
                                    <X className="size-3" /> Limpar filtro
                                  </button>
                                )}
                                {uniqueDates.map(d => (
                                  <button
                                    key={d}
                                    onClick={() => setFilter('event_date', activeFilter === d ? '' : d)}
                                    className={`text-left text-sm px-2 py-1 rounded transition-colors hover:bg-muted ${activeFilter === d ? 'bg-muted font-medium' : ''}`}
                                  >
                                    {formatDate(d)}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <Input
                                  placeholder="Buscar usuário..."
                                  value={activeFilter}
                                  onChange={e => setFilter('name', e.target.value)}
                                  autoFocus
                                />
                                {activeFilter && (
                                  <button
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => setFilter('name', '')}
                                  >
                                    <X className="size-3" /> Limpar
                                  </button>
                                )}
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>

                        {activeFilter && (
                          <button onClick={() => setFilter(colId, '')} className="text-muted-foreground/60 hover:text-foreground">
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                Nenhum registro encontrado.
              </TableCell>
            </TableRow>
          )}
          {table.getRowModel().rows.map(row => (
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
          ))}
        </TableBody>
      </Table>
    </>
  );
}
