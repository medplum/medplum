import { WeekCalendar } from '@/components/agenda/WeekCalendar';

export default function AgendaPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">Agenda</h1>
      </div>
      <WeekCalendar />
    </div>
  );
}
