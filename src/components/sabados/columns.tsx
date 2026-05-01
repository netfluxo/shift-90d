'use client';

import { type ColumnDef, type Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type SabadoRow = {
  id: string;
  event_date: string;
  points_delta: number;
  users: { name: string } | { name: string }[] | null;
};

export function getName(users: SabadoRow['users']): string {
  if (!users) return '';
  if (Array.isArray(users)) return users[0]?.name ?? '';
  return users.name;
}

export function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function SortHeader({
  column, title,
}: {
  column: Column<SabadoRow, unknown>;
  title: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="-ml-3 h-8" />}
      >
        {title}
        {column.getIsSorted() === 'desc' ? <ArrowDown className="size-4" /> :
         column.getIsSorted() === 'asc' ? <ArrowUp className="size-4" /> :
         <ChevronsUpDown className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
          <ArrowUp /> Crescente
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDown /> Decrescente
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => column.clearSorting()}>
          <ChevronsUpDown /> Padrão
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function getColumns(
  isAdmin: boolean,
  onDelete: (id: string) => void,
): ColumnDef<SabadoRow>[] {
  return [
    {
      accessorKey: 'event_date',
      header: ({ column }) => <SortHeader column={column} title="Data" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {formatDate(row.original.event_date)}
        </span>
      ),
    },
    {
      id: 'name',
      accessorFn: row => getName(row.users),
      header: ({ column }) => <SortHeader column={column} title="Usuário" />,
      cell: ({ row }) => (
        <span className="font-medium">{getName(row.original.users) || '—'}</span>
      ),
    },
    ...(isAdmin ? [{
      id: 'actions',
      cell: ({ row }: { row: { original: SabadoRow } }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(row.original.id)}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    } as ColumnDef<SabadoRow>] : []),
  ];
}
