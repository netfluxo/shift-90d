'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';

type User = { id: string; name: string };

function getSaturdays(): { value: string; label: string }[] {
  const today = new Date();
  const d = new Date(today.getFullYear(), 0, 1);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  const result = [];
  while (d <= today) {
    const iso = d.toISOString().slice(0, 10);
    const [y, m, day] = iso.split('-');
    result.push({ value: iso, label: `${day}/${m}/${y}` });
    d.setDate(d.getDate() + 7);
  }
  return result.reverse();
}

export default function AddSabadoButton({ users }: { users: User[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const saturdays = getSaturdays();

  async function handleSubmit() {
    if (!userId || !eventDate) { setError('Selecione a data e o usuário.'); return; }
    setLoading(true);
    setError('');
    const res = await fetch('/api/sabados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, event_date: eventDate }),
    });
    setLoading(false);
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Erro ao salvar.'); return; }
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) { setError(''); setUserId(''); setEventDate(''); }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        + Registrar sábado
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar presença</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="select-date">Data</Label>
              <Select value={eventDate} onValueChange={v => setEventDate(v ?? '')}>
                <SelectTrigger id="select-date" className="w-full">
                  <SelectValue placeholder="Selecione o sábado" />
                </SelectTrigger>
                <SelectContent>
                  {saturdays.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="select-user">Usuário</Label>
              <Select value={userId} onValueChange={v => setUserId(v ?? '')}>
                <SelectTrigger id="select-user" className="w-full">
                  <SelectValue placeholder="Selecione o usuário" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? 'Salvando…' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
