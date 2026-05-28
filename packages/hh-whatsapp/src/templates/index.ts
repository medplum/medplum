import { formatDate, formatTime } from '@hh/core';

export const templates = {
  appointmentReminder(p: {
    patientName: string;
    practitionerName: string;
    start: string;
    specialty: string;
  }): string {
    return `Olá, ${p.patientName}! 👋

Lembramos que você tem uma consulta agendada:
📅 *${formatDate(p.start)}* às *${formatTime(p.start)}*
👩‍⚕️ Com: ${p.practitionerName} — ${p.specialty}

Para confirmar, responda *SIM*.
Para reagendar, responda *REAGENDAR*.

Home Health 🏥`;
  },

  appointmentConfirmed(p: { patientName: string }): string {
    return `✅ Consulta confirmada! Até lá, ${p.patientName}!`;
  },

  appointmentCancelled(p: { patientName: string; practitionerName: string }): string {
    return `Olá, ${p.patientName}. Sua consulta com ${p.practitionerName} foi cancelada. Entre em contato para reagendar.`;
  },

  appointmentReschedule(p: { practitionerName: string }): string {
    return `Entendido! ${p.practitionerName} entrará em contato para reagendar sua consulta.`;
  },
};

export type InboundIntent = 'confirm' | 'reschedule' | 'cancel' | 'unknown';

export function parseInboundIntent(text: string): InboundIntent {
  const t = text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^(sim|s|confirmo|ok)$/.test(t)) return 'confirm';
  if (/^(reagendar|remarcar|outro dia|outra hora)/.test(t)) return 'reschedule';
  if (/^(cancelar|nao|n)$/.test(t)) return 'cancel';
  return 'unknown';
}
