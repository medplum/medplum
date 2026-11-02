// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { formatHumanName } from '@medplum/core';
import type { Appointment, HealthcareService, HumanName, Patient, Slot } from '@medplum/fhirtypes';
import type { EventDetailLevel } from './constants';
import { DEFAULT_EVENT_DETAIL_LEVEL, EVENT_DETAIL_LEVELS, EVENT_PROPERTY } from './constants';

/*
 * Pure functions from Medplum resources to Google Calendar event bodies. Nothing here talks
 * to Medplum or Google: callers resolve the Patient and HealthcareService first and pass
 * them in.
 */

const DEFAULT_APPOINTMENT_URL_TEMPLATE = 'https://app.medplum.com/Appointment/{id}';

/** The subset of a Google Calendar event this integration writes. */
export interface GoogleCalendarEvent {
  id: string;
  etag?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  transparency: 'opaque' | 'transparent';
  visibility: 'default' | 'public' | 'private' | 'confidential';
  attendees: { email: string }[];
  /** The practitioner's own reminder settings apply. */
  reminders: { useDefault: boolean };
  extendedProperties: { private: Record<string, string> };
}

/** Appointment statuses that get a Mirrored Event. Every other status means "the event must not exist". */
export const MIRRORED_APPOINTMENT_STATUSES: ReadonlySet<Appointment['status']> = new Set([
  'booked',
  'arrived',
  'checked-in',
  'fulfilled',
  'noshow',
]);

/**
 * Derives the Google event ID from a Medplum resource ID.
 *
 * Google accepts client-chosen IDs in `[a-v0-9]{5,1024}`, unique per calendar. A UUID
 * with its hyphens removed fits. Server-generated IDs are lowercase, but the server's
 * UUID check accepts uppercase, so lowercase first.
 * @param resourceId - The Appointment or Slot ID.
 * @returns The event ID, or undefined when the ID can't be used as one.
 */
export function toGoogleEventId(resourceId: string): string | undefined {
  const id = resourceId.toLowerCase().replaceAll('-', '');
  return /^[a-v0-9]{5,1024}$/.test(id) ? id : undefined;
}

/**
 * Resolves the effective Event Detail Level: the stricter of the project ceiling and the
 * practitioner's own choice. An unknown ceiling is the default; an unknown override is no
 * restriction.
 * @param ceiling - The project's `GOOGLE_CALENDAR_DETAIL_LEVEL` secret.
 * @param override - The practitioner's `event-detail-level` on their connection.
 * @returns The level to build events at.
 */
export function resolveDetailLevel(ceiling?: string, override?: string): EventDetailLevel {
  const rank = (value: string | undefined): number => EVENT_DETAIL_LEVELS.indexOf(value as EventDetailLevel);
  const ceilingRank = rank(ceiling) === -1 ? EVENT_DETAIL_LEVELS.indexOf(DEFAULT_EVENT_DETAIL_LEVEL) : rank(ceiling);
  const overrideRank = rank(override) === -1 ? ceilingRank : rank(override);
  return EVENT_DETAIL_LEVELS[Math.min(ceilingRank, overrideRank)];
}

// Google rejects anything but RFC 3339, and Date#toISOString throws on an invalid date.
function toUtcInstant(value: string | undefined): string | undefined {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function pickName(patient: Patient): HumanName | undefined {
  return patient.name?.find((n) => n.use === 'official') ?? patient.name?.[0];
}

/**
 * "J.S." from a HumanName: the first letter of the first given name and of the family name.
 * @param name - The name.
 * @returns The initials, or undefined when neither part exists.
 */
export function toInitials(name: HumanName | undefined): string | undefined {
  const parts = [name?.given?.[0], name?.family].filter((part): part is string => Boolean(part?.trim()));
  return parts.length ? parts.map((part) => `${part.trim()[0].toUpperCase()}.`).join('') : undefined;
}

function toFullName(name: HumanName | undefined): string | undefined {
  return (name && formatHumanName(name, { prefix: false, suffix: false })) || undefined;
}

/** Everything `buildAppointmentEvent` needs beyond the Appointment itself. */
export interface AppointmentEventContext {
  projectId: string;
  level: EventDetailLevel;
  /** `GOOGLE_CALENDAR_APPOINTMENT_URL`; `{id}` is replaced with the Appointment ID. */
  appointmentUrlTemplate?: string;
  /** The Patient participants, loaded only when the level needs them. */
  patients?: Patient[];
  /** The HealthcareService behind `serviceType`, loaded only when the level needs it. */
  service?: HealthcareService;
}

function appointmentSummary(appointment: Appointment, context: AppointmentEventContext): string {
  const { level, patients } = context;
  if (level === 'busy-only' || !patients?.length) {
    return 'Appointment';
  }
  if (patients.length > 1) {
    return `Appointment · ${patients.length} patients`;
  }
  const name = pickName(patients[0]);
  if (level === 'initials') {
    const initials = toInitials(name);
    return initials ? `Appointment · ${initials}` : 'Appointment';
  }
  const fullName = toFullName(name);
  if (!fullName) {
    return 'Appointment';
  }
  const serviceName =
    context.service?.name ??
    appointment.serviceType?.[0]?.text ??
    appointment.serviceType?.[0]?.coding?.[0]?.display ??
    appointment.appointmentType?.text;
  return serviceName ? `${fullName} · ${serviceName}` : fullName;
}

function appointmentDescription(appointment: Appointment, id: string, context: AppointmentEventContext): string {
  const template = context.appointmentUrlTemplate || DEFAULT_APPOINTMENT_URL_TEMPLATE;
  const lines = [template.replaceAll('{id}', id)];
  if (context.level === 'full') {
    const reason = appointment.reasonCode?.[0]?.text ?? appointment.reasonCode?.[0]?.coding?.[0]?.display;
    if (reason) {
      lines.push(`Reason: ${reason}`);
    }
    if (appointment.comment) {
      lines.push(`Notes: ${appointment.comment}`);
    }
  }
  return lines.join('\n');
}

// The skeleton both builders share; undefined when the resource has no usable ID or times.
function baseEvent(
  resource: Appointment | Slot,
  id: string,
  summary: string,
  projectId: string
): GoogleCalendarEvent | undefined {
  const eventId = toGoogleEventId(id);
  const start = toUtcInstant(resource.start);
  const end = toUtcInstant(resource.end);
  if (!eventId || !start || !end || end <= start) {
    return undefined;
  }
  return {
    id: eventId,
    status: 'confirmed',
    summary,
    start: { dateTime: start },
    end: { dateTime: end },
    transparency: 'opaque',
    visibility: 'private',
    attendees: [],
    reminders: { useDefault: true },
    extendedProperties: {
      private: { [EVENT_PROPERTY.project]: projectId, [EVENT_PROPERTY.source]: `${resource.resourceType}/${id}` },
    },
  };
}

/**
 * Builds the Mirrored Event for an Appointment.
 * @param appointment - A mirrorable Appointment.
 * @param context - Project, level and the resources the level needs.
 * @returns The event body, or undefined when the Appointment has no usable ID, start or end.
 */
export function buildAppointmentEvent(
  appointment: Appointment,
  context: AppointmentEventContext
): GoogleCalendarEvent | undefined {
  const id = appointment.id;
  const event = id
    ? baseEvent(appointment, id, appointmentSummary(appointment, context), context.projectId)
    : undefined;
  if (!id || !event) {
    return undefined;
  }
  event.description = appointmentDescription(appointment, id, context);
  if (context.level === 'full') {
    const site = appointment.participant?.find((p) => p.actor?.reference?.startsWith('Location/'))?.actor?.display;
    if (site) {
      event.location = site;
    }
  }
  return event;
}

/**
 * Builds the "Busy" event for a blocked-time Slot. The title never reveals the Slot's
 * comment, whatever the detail level.
 * @param slot - A mirrorable Slot.
 * @param projectId - The customer project ID.
 * @returns The event body, or undefined when the Slot has no usable ID, start or end.
 */
export function buildSlotEvent(slot: Slot, projectId: string): GoogleCalendarEvent | undefined {
  return slot.id ? baseEvent(slot, slot.id, 'Busy', projectId) : undefined;
}
