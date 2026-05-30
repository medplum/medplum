'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { SOAPNote } from '@hh/fhir';
import { formatDate } from '@hh/core';

interface Props {
  patientId: string;
  patientName: string;
}

const SOAP_LABELS = {
  subjective: 'S — Subjetivo',
  objective: 'O — Objetivo',
  assessment: 'A — Avaliação',
  plan: 'P — Plano',
} as const;

const emptyForm = { subjective: '', objective: '', assessment: '', plan: '' };

export function EvolucaoClient({ patientId, patientName }: Props) {
  const [notes, setNotes] = useState<SOAPNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/soap?patientId=${patientId}`);
      const data = await res.json();
      setNotes(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/soap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, ...form }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Erro ao salvar evolução');
        return;
      }
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/pacientes/${patientId}`}
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          ← {patientName}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">Evoluções</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Nova evolução
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-slate-200 p-5 mb-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-slate-700">Nova evolução</h2>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {(['subjective', 'objective', 'assessment', 'plan'] as const).map((field) => (
            <div key={field}>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {SOAP_LABELS[field]}
              </label>
              <textarea
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </div>
          ))}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(emptyForm); setError(null); }}
              className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Carregando…</div>
      ) : notes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">Nenhuma evolução registrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100"
            >
              <div className="px-5 py-3">
                <span className="text-xs font-semibold text-slate-500">
                  {formatDate(note.date)}
                </span>
              </div>
              {(['subjective', 'objective', 'assessment', 'plan'] as const)
                .filter((f) => note[f])
                .map((field) => (
                  <div key={field} className="px-5 py-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">
                      {SOAP_LABELS[field]}
                    </p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{note[field]}</p>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
