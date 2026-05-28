export default function AgendaPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">Agenda</h1>
        <button className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + Nova consulta
        </button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-2 mb-4">
        <button className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 text-sm">‹</button>
        <span className="text-sm font-medium text-slate-700">Semana de 26 mai – 1 jun</span>
        <button className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 text-sm">›</button>
        <button className="ml-auto text-xs text-sky-600 hover:underline">Hoje</button>
      </div>

      {/* Calendar placeholder */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-slate-500">
              {d}
            </div>
          ))}
        </div>

        <div className="h-96 flex items-center justify-center text-slate-400 text-sm">
          Nenhuma consulta esta semana
        </div>
      </div>
    </div>
  );
}
