'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import type { HHAppointment } from '@hh/core';
import { formatTime } from '@hh/core';
import { AppointmentModal } from './AppointmentModal';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00–20:00
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUS_COLOR: Record<string, string> = {
  scheduled: 'bg-sky-100 border-sky-400 text-sky-900',
  confirmed: 'bg-green-100 border-green-400 text-green-900',
  completed: 'bg-slate-100 border-slate-400 text-slate-600',
  cancelled: 'bg-red-50 border-red-300 text-red-400 line-through',
  'no-show': 'bg-orange-50 border-orange-300 text-orange-700',
};

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday start
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDateParam(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function WeekCalendar() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [appointments, setAppointments] = useState<HHAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<
    | { type: 'create'; date: string; time: string }
    | { type: 'edit'; appointment: HHAppointment }
    | null
  >(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = fmtDateParam(weekStart);
      const to = fmtDateParam(addDays(weekStart, 6));
      const res = await fetch(`/api/appointments?from=${from}&to=${to}`);
      if (res.ok) setAppointments(await res.json());
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  function apptsByDayHour(dayIndex: number, hour: number) {
    const day = weekDays[dayIndex];
    return appointments.filter(a => {
      const s = new Date(a.start);
      return (
        s.getFullYear() === day.getFullYear() &&
        s.getMonth() === day.getMonth() &&
        s.getDate() === day.getDate() &&
        s.getHours() === hour
      );
    });
  }

  function isToday(day: Date) {
    const t = new Date();
    return day.getDate() === t.getDate() &&
      day.getMonth() === t.getMonth() &&
      day.getFullYear() === t.getFullYear();
  }

  function handleSaved(appt: HHAppointment) {
    setAppointments(prev => {
      const exists = prev.find(a => a.id === appt.id);
      if (exists) return prev.map(a => a.id === appt.id ? appt : a);
      return [...prev, appt];
    });
  }

  const today = new Date();
  const isCurrentWeek = fmtDateParam(weekStart) === fmtDateParam(startOfWeek(today));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setWeekStart(w => addDays(w, -7))}
          className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 text-sm font-medium">‹</button>

        <span className="text-sm font-medium text-slate-700 min-w-48 text-center">
          {weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} –{' '}
          {addDays(weekStart, 6).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        <button onClick={() => setWeekStart(w => addDays(w, 7))}
          className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 text-sm font-medium">›</button>

        {!isCurrentWeek && (
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="ml-2 text-xs text-sky-600 hover:underline">Hoje</button>
        )}

        {loading && <span className="ml-auto text-xs text-slate-400">Carregando...</span>}
      </div>

      {/* Grid — hidden on mobile, show day list instead */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: '52px repeat(7, 1fr)' }}>
          {/* Day headers */}
          <div className="border-b border-slate-200" />
          {weekDays.map((day, i) => (
            <div key={i} className={`border-b border-l border-slate-200 py-2 text-center ${isToday(day) ? 'bg-sky-50' : ''}`}>
              <p className="text-xs text-slate-500">{DAYS[day.getDay()]}</p>
              <p className={`text-sm font-semibold ${isToday(day) ? 'text-sky-600' : 'text-slate-900'}`}>
                {day.getDate()}
              </p>
            </div>
          ))}

          {/* Time rows */}
          {HOURS.map(hour => (
            <Fragment key={hour}>
              <div className="border-b border-slate-100 py-1 pr-2 text-right">
                <span className="text-xs text-slate-400">{hour}:00</span>
              </div>
              {weekDays.map((day, dayIdx) => {
                const appts = apptsByDayHour(dayIdx, hour);
                const dateStr = fmtDateParam(day);
                const timeStr = `${String(hour).padStart(2, '0')}:00`;
                return (
                  <div key={`${dayIdx}-${hour}`}
                    onClick={() => setModal({ type: 'create', date: dateStr, time: timeStr })}
                    className={`border-b border-l border-slate-100 min-h-12 p-0.5 cursor-pointer group relative
                      ${isToday(day) ? 'bg-sky-50/50' : 'hover:bg-slate-50'}`}>
                    {appts.map(a => (
                      <button key={a.id}
                        onClick={e => { e.stopPropagation(); setModal({ type: 'edit', appointment: a }); }}
                        className={`w-full text-left text-xs px-1.5 py-1 rounded border-l-2 mb-0.5 truncate ${STATUS_COLOR[a.status] ?? STATUS_COLOR.scheduled}`}>
                        <span className="font-medium">{formatTime(a.start)}</span> {a.patientName}
                      </button>
                    ))}
                    {appts.length === 0 && (
                      <span className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs opacity-0 group-hover:opacity-100">+</span>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Mobile: day list */}
      <div className="md:hidden space-y-2">
        {weekDays.map((day, dayIdx) => {
          const dayAppts = appointments
            .filter(a => fmtDateParam(new Date(a.start)) === fmtDateParam(day))
            .sort((a, b) => a.start.localeCompare(b.start));
          return (
            <div key={dayIdx} className={`bg-white rounded-xl border ${isToday(day) ? 'border-sky-300' : 'border-slate-200'}`}>
              <div className={`px-4 py-2 border-b flex items-center justify-between ${isToday(day) ? 'border-sky-200 bg-sky-50' : 'border-slate-100'}`}>
                <span className={`text-sm font-semibold ${isToday(day) ? 'text-sky-700' : 'text-slate-700'}`}>
                  {DAYS[day.getDay()]}, {day.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </span>
                <button
                  onClick={() => setModal({ type: 'create', date: fmtDateParam(day), time: '09:00' })}
                  className="text-xs text-sky-600 font-medium">+ Adicionar</button>
              </div>
              {dayAppts.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-400">Sem consultas</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {dayAppts.map(a => (
                    <button key={a.id} onClick={() => setModal({ type: 'edit', appointment: a })}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`w-1.5 h-1.5 rounded-full ${a.status === 'cancelled' ? 'bg-red-400' : 'bg-sky-500'}`} />
                        <span className="text-xs text-slate-500 w-10 shrink-0">{formatTime(a.start)}</span>
                        <span className="text-sm font-medium text-slate-900 truncate">{a.patientName}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {modal?.type === 'create' && (
        <AppointmentModal
          initial={{ date: modal.date, time: modal.time }}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {modal?.type === 'edit' && (
        <AppointmentModal
          appointment={modal.appointment}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
