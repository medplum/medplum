export default function FinanceiroPage() {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-6">Financeiro</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Receita este mês', value: 'R$ 0,00' },
          { label: 'Consultas realizadas', value: '0' },
          { label: 'Ticket médio', value: 'R$ 0,00' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <p className="text-slate-400 text-sm">Nenhum lançamento financeiro ainda.</p>
      </div>
    </div>
  );
}
