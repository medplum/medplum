'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { HHPatient } from '@hh/core';
import { formatPhone, formatCPF, formatDate } from '@hh/core';
import { PatientModal } from './PatientModal';

export function PatientList({ initial }: { initial: HHPatient[] }) {
  const [patients, setPatients] = useState<HHPatient[]>(initial);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(query)}`);
      if (res.ok) setPatients(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q), 350);
    return () => clearTimeout(t);
  }, [q, search]);

  function handleSaved(patient: HHPatient) {
    setPatients(prev => [patient, ...prev]);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">Pacientes</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Novo paciente
        </button>
      </div>

      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar por nome..."
        className="w-full mb-4 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
      />

      {loading && (
        <p className="text-sm text-slate-400 text-center py-4">Buscando...</p>
      )}

      {!loading && patients.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">
            {q ? `Nenhum paciente encontrado para "${q}"` : 'Nenhum paciente cadastrado ainda.'}
          </p>
          {!q && (
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 text-sky-600 text-sm font-medium hover:underline"
            >
              Cadastrar primeiro paciente
            </button>
          )}
        </div>
      )}

      {!loading && patients.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {patients.map(p => (
            <Link
              key={p.id}
              href={`/pacientes/${p.id}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              {/* avatar */}
              <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-sm font-semibold shrink-0">
                {p.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {formatPhone(p.phone)}
                  {p.cpf && ` · ${formatCPF(p.cpf)}`}
                </p>
              </div>

              {p.birthDate && (
                <span className="text-xs text-slate-400 shrink-0 hidden sm:block">
                  {formatDate(p.birthDate)}
                </span>
              )}

              <span className="text-slate-300 text-lg">›</span>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <PatientModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
