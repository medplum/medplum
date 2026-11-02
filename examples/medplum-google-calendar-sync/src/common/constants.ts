// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/** Code system and extension namespace for everything this integration writes to FHIR. */
export const GOOGLE_CALENDAR_NAMESPACE = 'https://www.medplum.com/integrations/google-calendar';

/** Project secrets written by `$google-calendar-install`. */
export const SECRET = {
  clientId: 'GOOGLE_CALENDAR_CLIENT_ID',
  clientSecret: 'GOOGLE_CALENDAR_CLIENT_SECRET',
  appointmentUrl: 'GOOGLE_CALENDAR_APPOINTMENT_URL',
  detailLevel: 'GOOGLE_CALENDAR_DETAIL_LEVEL',
  webhookUrl: 'GOOGLE_CALENDAR_WEBHOOK_URL',
} as const;

/** Keys written to `extendedProperties.private` on every Mirrored Event. Google caps keys at 44 characters. */
export const EVENT_PROPERTY = {
  project: 'medplumProject',
  source: 'medplumSource',
  detail: 'medplumDetail',
  connection: 'medplumConnection',
} as const;

/** How much of an Appointment a Mirrored Event reveals, least to most. */
export const EVENT_DETAIL_LEVELS = ['busy-only', 'initials', 'full'] as const;
export type EventDetailLevel = (typeof EVENT_DETAIL_LEVELS)[number];
export const DEFAULT_EVENT_DETAIL_LEVEL: EventDetailLevel = 'busy-only';

/** How the shared Bots are found from a customer project. */
export const BOT_IDENTIFIER_SYSTEM = 'https://www.medplum.com/bots';
export const BOT_IDENTIFIER_VALUE = {
  sync: 'google-calendar-sync-bot',
  syncRange: 'google-calendar-sync-range-bot',
  reconcile: 'google-calendar-reconcile-bot',
  connect: 'google-calendar-connect-bot',
  status: 'google-calendar-status-bot',
  settings: 'google-calendar-settings-bot',
  disconnect: 'google-calendar-disconnect-bot',
  install: 'install-google-calendar',
  inbound: 'google-calendar-import-bot',
  webhook: 'google-calendar-webhook-bot',
} as const;

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

/** Imported Slot identities, versioned independently of connection storage. */
export const IMPORT_IDENTIFIER_SYSTEM = `${GOOGLE_CALENDAR_NAMESPACE}/imported-slot`;

export const GOOGLE_CALENDAR_METADATA_SCOPE = 'https://www.googleapis.com/auth/calendar.calendars.readonly';
