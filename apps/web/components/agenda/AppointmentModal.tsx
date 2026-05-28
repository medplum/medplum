'use client';

import { useState, useEffect } from 'react';
import type { HHAppointment, HHPatient } from '@hh/core';

interface Props {
  initial?: { date: string; time: string };
  appointment?: HHAppointment;
  onClose: () => void;
  onSaved: (appt: HHAppointment) => void;
}

const DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '1h30', minutes: 90 },
  { label: '2h', minutes: 120 },
];

export function AppointmentModal({ initial, appointment, onClose, onSaved }: Props) {
  const isEdit = !!appointment;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [patients, setPatients] = useState<HHPatient[]>([]);
  const [patientQuery, setPatientQuery] = useState('');

  const initDate = appointment
    ? appointment.start.slice(0, 10)
    : (initial?.date ?? new Date().toISOString().slice(0, 10));
  const initTime = appointment
    ? appointment.start.slice(11, 16)
    : (initial?.time ?? '09:00');

  const [form, setForm] = useState({
    patientId: appointment?.patientId ?? '',
    patientName: appointment?.patientName ?? '',
    date: initDate,
    time: initTime,
    durationMinutes: 60,
    notes: appointment?.notes ?? '',
    isHomeVisit: appointment?.isHomeVisit ?? false,
    homeVisitAddress: appointment?.homeVisitAddress ?? '',
  });

  function set(field: string, value: string | number | boolean) {
    setForm(f => ({ ...f, [field]: value }));
  }

  // Patient search
  useEffect(() => {
    if (isEdit) return;
    const t = setTimeout(async () => {
      if (patientQuery.length < 2) { setPatients([]); return; }
      const res = await fetch(`/api/patients?q=${encodeURIComponent(patientQuery)}`);
      if (res.ok) setPatients(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [patientQuery, isEdit]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const start = `${form.date}T${form.time}:00`;
      const endDate = new Date(start);
      endDate.setMinutes(endDate.getMinutes() + form.durationMinutes);
      const end = endDate.toISOString().slice(0, 19);

      const url = isEdit
        ? `/api/appointments/${appointment!.id}`
        : '/api/appointments';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: form.patientId,
          patientName: form.patientName,
          start,
          end,
          notes: form.notes,
          isHomeVisit: form.isHomeVisit,
          homeVisitAddress: form.homeVisitAddress,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao salvar'); return; }
      onSaved(data);
      onClose();
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!appointment) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao cancelar'); return; }
      onSaved(data);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? 'Consulta' : 'Nova consulta'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Patient */}
          {!isEdit ? (
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Paciente <span className="text-red-500">*</span>
              </label>
              {form.patientId ? (
                <div className="flex items-center justify-between rounded-lg border border-sky-400 bg-sky-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-900">{form.patientName}</span>
                  <button type="button" onClick={() => { set('patientId', ''); set('patientName', ''); }}
                    className="text-slate-400 hover:text-slate-600 text-sm">trocar</button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={e => setPatientQuery(e.target.value)}
                    placeholder="Buscar paciente..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {patients.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {patients.map(p => (
                        <button key={p.id} type="button"
                          onClick={() => { set('patientId', p.id); set('patientName', p.name); setPatientQuery(''); setPatients([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex flex-col">
                          <span className="font-medium text-slate-900">{p.name}</span>
                          <span className="text-xs text-slate-500">{p.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="text-xs text-slate-500">Paciente</p>
              <p className="text-sm font-medium text-slate-900">{appointment.patientName}</p>
            </div>
          )}

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Data <span className="text-red-500">*</span></label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Horário <span className="text-red-500">*</span></label>
              <input type="time" value={form.time} onChange={e => set('time', e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>

          {/* Duration */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duração</label>
              <div className="flex gap-2 flex-wrap">
                {DURATIONS.map(d => (
                  <button key={d.minutes} type="button"
                    onClick={() => set('durationMinutes', d.minutes)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      form.durationMinutes === d.minutes
                        ? 'bg-sky-600 text-white'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Home visit */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isHomeVisit}
              onChange={e => set('isHomeVisit', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-sky-600" />
            <span className="text-sm text-slate-700">Visita domiciliar</span>
          </label>

          {form.isHomeVisit && (
            <input type="text" value={form.homeVisitAddress}
              onChange={e => set('homeVisitAddress', e.target.value)}
              placeholder="Endereço da visita"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Observações</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            {isEdit && appointment.status !== 'cancelled' && (
              <button type="button" onClick={handleCancel} disabled={loading}
                className="flex-1 border border-red-300 text-red-600 text-sm font-medium py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-60">
                Cancelar consulta
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-300 text-slate-700 text-sm font-medium py-2 rounded-lg hover:bg-slate-50 transition-colors">
              Fechar
            </button>
            {appointment?.status !== 'cancelled' && (
              <button type="submit" disabled={loading || (!isEdit && !form.patientId)}
                className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Agendar'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
