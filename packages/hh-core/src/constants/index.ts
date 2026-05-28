import type { Specialty } from '../types';

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  fisioterapia: 'Fisioterapia',
  psicologia: 'Psicologia',
  nutricao: 'Nutrição',
  fonoaudiologia: 'Fonoaudiologia',
  quiropraxia: 'Quiropraxia',
  'terapia-ocupacional': 'Terapia Ocupacional',
  enfermagem: 'Enfermagem',
  'cuidados-domiciliares': 'Cuidados Domiciliares',
  'educacao-fisica': 'Educação Física',
  estetica: 'Estética',
  outro: 'Outro',
};

export const APPOINTMENT_STATUS_LABELS = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Realizado',
  cancelled: 'Cancelado',
  'no-show': 'Não compareceu',
} as const;

export const PLAN_LABELS = {
  starter: 'Starter',
  pro: 'Pro',
  clinic: 'Clínica',
} as const;

export const TRIAL_DAYS = 14;

export const PLAN_LIMITS = {
  starter: { maxPractitioners: 1 },
  pro: { maxPractitioners: 5 },
  clinic: { maxPractitioners: 20 },
} as const;
