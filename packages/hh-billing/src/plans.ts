import type { SubscriptionPlan } from '@hh/core';
import { TRIAL_DAYS } from '@hh/core';

export interface Plan {
  id: SubscriptionPlan;
  name: string;
  priceBRL: number;
  maxPractitioners: number;
  features: string[];
}

export const PLANS: Record<SubscriptionPlan, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceBRL: 9700,
    maxPractitioners: 1,
    features: ['agenda', 'pacientes', 'evolucoes'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceBRL: 19700,
    maxPractitioners: 5,
    features: ['agenda', 'pacientes', 'evolucoes', 'whatsapp', 'financeiro'],
  },
  clinic: {
    id: 'clinic',
    name: 'Clínica',
    priceBRL: 49700,
    maxPractitioners: 20,
    features: ['agenda', 'pacientes', 'evolucoes', 'whatsapp', 'financeiro', 'multi-agenda'],
  },
};

export type AccessStatus = 'active' | 'trial' | 'expired' | 'blocked';

export function getAccessStatus(params: {
  subscriptionStatus: string;
  createdAt: Date;
}): AccessStatus {
  if (params.subscriptionStatus === 'active') return 'active';
  if (params.subscriptionStatus === 'cancelled') return 'blocked';

  const trialEnds = new Date(params.createdAt);
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);
  if (new Date() < trialEnds) return 'trial';

  return 'expired';
}

export function trialDaysRemaining(createdAt: Date): number {
  const trialEnds = new Date(createdAt);
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);
  const ms = trialEnds.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export { TRIAL_DAYS };
