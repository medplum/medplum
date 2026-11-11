#!/usr/bin/env node
// CareDevi booking pilot — Medplum provisioning (idempotent).
//
// Contract: mycaredevi/docs/booking-pilot-contract.md §1. See README.md in this folder.
//
// Node >= 20, ESM, zero npm dependencies (uses global fetch).
//
//   node provision.mjs --dry-run                       # print every request, no network
//   node provision.mjs --config clinics/precision-dpc.json
//   node provision.mjs --skip-subscriptions
//   node provision.mjs --with-connect-subscription      # only if Connect's own script is NOT used
//
// Every resource is written with a FHIR conditional update
// (PUT /fhir/R4/<Type>?<search>), so re-running converges instead of duplicating.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Constants (contract §1 — must match backend / connect / mobile exactly)
// ---------------------------------------------------------------------------

export const SYS = Object.freeze({
  clinic: 'https://caredevi.com/clinic',
  service: 'https://caredevi.com/service',
  schedule: 'https://caredevi.com/schedule',
  // Not named in the contract; CareDevi-owned systems used only for idempotent upserts.
  location: 'https://caredevi.com/location',
  practitioner: 'https://caredevi.com/practitioner',
  practitionerRole: 'https://caredevi.com/practitioner-role',
  subscription: 'https://caredevi.com/subscription',
});

export const EXT = Object.freeze({
  appContent: 'https://caredevi.com/fhir/StructureDefinition/app-content',
  bookingConfig: 'https://caredevi.com/fhir/StructureDefinition/booking-config',
  intakeQuestionnaire: 'https://caredevi.com/fhir/StructureDefinition/intake-questionnaire',
  // @medplum/core SchedulingParametersURI
  schedulingParameters: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
  // @medplum/core ServiceTypeReferenceURI (used inside Schedule.serviceType concepts)
  serviceTypeReference: 'https://medplum.com/fhir/service-type-reference',
  // @medplum/core TimezoneExtensionURI (actor-level fallback timezone)
  timezone: 'http://hl7.org/fhir/StructureDefinition/timezone',
  // NOTE the "www." — this is the URL packages/server/src/workers/subscription.ts reads.
  subscriptionSecret: 'https://www.medplum.com/fhir/StructureDefinition/subscription-secret',
  subscriptionInteraction: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
  subscriptionMaxAttempts: 'https://medplum.com/fhir/StructureDefinition/subscription-max-attempts',
});

export const PATIENT_ACCESS_POLICY_NAME = 'CareDevi Patient';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const ref = (type, id) => ({ reference: `${type}/${id}` });

const identifier = (system, value) => [{ system, value }];

function telecom({ phone, email, website }) {
  const out = [];
  if (phone) out.push({ system: 'phone', value: phone, use: 'work' });
  if (email) out.push({ system: 'email', value: email, use: 'work' });
  if (website) out.push({ system: 'url', value: website, use: 'work' });
  return out.length ? out : undefined;
}

function address(a) {
  if (!a) return undefined;
  const text = `${(a.line ?? []).join(', ')}, ${a.city}, ${a.state} ${a.postalCode}`;
  return { use: 'work', type: 'physical', text, line: a.line, city: a.city, state: a.state, postalCode: a.postalCode, country: a.country };
}

const minutes = (value) => ({ value, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' });

/** Normalise "9:00" / "09:00" / "09:00:00" to a FHIR time "09:00:00". */
export function fhirTime(t) {
  const parts = String(t).split(':').map((p) => p.padStart(2, '0'));
  while (parts.length < 3) parts.push('00');
  const out = parts.slice(0, 3).join(':');
  if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(out)) throw new Error(`Invalid time "${t}"`);
  return out;
}

/** Drop undefined values so printed/sent JSON is clean. */
export function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      out[k] = clean(v);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Pure resource builders (exported for provision.test.mjs)
// ---------------------------------------------------------------------------

export function buildOrganization(config) {
  const c = config.clinic;
  return clean({
    resourceType: 'Organization',
    identifier: identifier(SYS.clinic, c.slug),
    active: true,
    type: [
      {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'prov', display: 'Healthcare Provider' }],
      },
    ],
    name: c.name,
    alias: c.alias,
    telecom: telecom(c),
    address: c.address ? [address(c.address)] : undefined,
    extension: [{ url: EXT.appContent, valueString: JSON.stringify(c.content ?? {}) }],
  });
}

export function buildLocation(config, orgId) {
  const c = config.clinic;
  const l = config.location;
  return clean({
    resourceType: 'Location',
    identifier: identifier(SYS.location, l.slug),
    status: 'active',
    mode: 'instance',
    name: l.name ?? c.name,
    type: [
      { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'OF', display: 'Outpatient facility' }] },
    ],
    telecom: telecom({ phone: l.phone ?? c.phone, email: l.email, website: l.website }),
    address: address(l.address ?? c.address),
    position: l.position,
    managingOrganization: ref('Organization', orgId),
    hoursOfOperation: (l.hoursOfOperation ?? []).map((h) => ({
      daysOfWeek: h.daysOfWeek,
      allDay: h.allDay,
      openingTime: h.openingTime && fhirTime(h.openingTime),
      closingTime: h.closingTime && fhirTime(h.closingTime),
    })),
    extension: config.timezone ? [{ url: EXT.timezone, valueCode: config.timezone }] : undefined,
  });
}

export function buildPractitioner(config, p) {
  return clean({
    resourceType: 'Practitioner',
    identifier: identifier(SYS.practitioner, p.slug),
    active: true,
    name: [{ use: 'official', prefix: p.prefix, given: p.given, family: p.family, suffix: p.suffix }],
    gender: p.gender,
    telecom: telecom({ phone: p.phone, email: p.email }),
    photo: p.photoUrl ? [{ url: p.photoUrl, contentType: guessImageType(p.photoUrl) }] : undefined,
    qualification: p.qualification
      ? [
          {
            code: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0360', code: p.qualification.code, display: p.qualification.display }],
              text: p.qualification.display,
            },
          },
        ]
      : undefined,
    // Actor-level timezone: lowest-priority fallback read by Medplum scheduling (getTimeZone).
    extension: config.timezone ? [{ url: EXT.timezone, valueCode: config.timezone }] : undefined,
  });
}

function guessImageType(url) {
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

/** The CodeableConcept identifying a service; used for HealthcareService.type and Schedule.serviceType. */
export function serviceTypeConcept(service) {
  return { coding: [{ system: SYS.service, code: service.slug, display: service.name }], text: service.name };
}

export function buildHealthcareService(config, service, { orgId, locationId }) {
  const sched = [{ url: 'duration', valueDuration: minutes(service.durationMinutes) }];
  if (service.alignmentIntervalMinutes) sched.push({ url: 'alignmentInterval', valueDuration: minutes(service.alignmentIntervalMinutes) });
  if (service.bufferBeforeMinutes) sched.push({ url: 'bufferBefore', valueDuration: minutes(service.bufferBeforeMinutes) });
  if (service.bufferAfterMinutes) sched.push({ url: 'bufferAfter', valueDuration: minutes(service.bufferAfterMinutes) });
  if (config.timezone) {
    sched.push({ url: 'timezone', valueCode: config.timezone });
    // Anchor the alignment grid to clinic-local midnight (default is Etc/UTC).
    sched.push({ url: 'alignmentTimezone', valueCode: config.timezone });
  }
  // NOTE: no `availability` and no `service` sub-extension here — both are rejected on
  // HealthcareService by getHealthcareServiceSchedulingParameters (exactlyZero).

  const extension = [
    { url: EXT.schedulingParameters, extension: sched },
    { url: EXT.bookingConfig, valueString: JSON.stringify(service.bookingConfig ?? {}) },
  ];
  if (service.intakeQuestionnaire && config.questionnaire?.url) {
    extension.push({ url: EXT.intakeQuestionnaire, valueCanonical: config.questionnaire.url });
  }

  return clean({
    resourceType: 'HealthcareService',
    identifier: identifier(SYS.service, service.slug),
    active: true,
    providedBy: ref('Organization', orgId),
    type: [serviceTypeConcept(service)],
    location: [ref('Location', locationId)],
    name: service.name,
    comment: service.comment,
    extraDetails: service.extraDetails,
    telecom: telecom({ phone: config.clinic.phone }),
    appointmentRequired: true,
    // Native availability: informational, and the fallback layer if a Schedule
    // carries no per-service SchedulingParameters (Schedule availability wins).
    availableTime: (config.location?.hoursOfOperation ?? []).map((h) => ({
      daysOfWeek: h.daysOfWeek,
      allDay: h.allDay,
      availableStartTime: h.openingTime && fhirTime(h.openingTime),
      availableEndTime: h.closingTime && fhirTime(h.closingTime),
    })),
    extension,
  });
}

export function buildPractitionerRole(config, p, { practitionerId, orgId, locationId, serviceIds }) {
  return clean({
    resourceType: 'PractitionerRole',
    identifier: identifier(SYS.practitionerRole, `${config.clinic.slug}--${p.slug}`),
    active: true,
    practitioner: ref('Practitioner', practitionerId),
    organization: ref('Organization', orgId),
    location: [ref('Location', locationId)],
    healthcareService: serviceIds.map((id) => ref('HealthcareService', id)),
    code: p.roleText ? [{ text: p.roleText }] : undefined,
    specialty: p.specialty
      ? [{ coding: [{ system: p.specialty.system, code: p.specialty.code, display: p.specialty.display }], text: p.specialtyText ?? p.specialty.display }]
      : undefined,
  });
}

/**
 * SchedulingParameters `availability` sub-extension: the R5 Availability datatype in R4
 * extension form, one `availableTime` per window, `daysOfWeek` repeated per day.
 */
export function availabilityExtension(windows) {
  return {
    url: 'availability',
    extension: windows.map((w) => ({
      url: 'availableTime',
      extension: [
        ...w.daysOfWeek.map((d) => ({ url: 'daysOfWeek', valueCode: d })),
        ...(w.allDay
          ? [{ url: 'allDay', valueBoolean: true }]
          : [
              { url: 'availableStartTime', valueTime: fhirTime(w.start) },
              { url: 'availableEndTime', valueTime: fhirTime(w.end) },
            ]),
      ],
    })),
  };
}

/**
 * Schedule for one practitioner offering one or more services.
 * `services` = [{ id, slug, name }] (HealthcareService ids already resolved).
 */
export function buildSchedule(config, s, { practitionerId, services }) {
  return clean({
    resourceType: 'Schedule',
    identifier: identifier(SYS.schedule, s.slug),
    active: true,
    // Medplum $find/$hold require EXACTLY ONE actor
    // (getSchedulingParametersGroup: "Scheduling only supported on schedules with exactly one actor").
    actor: [ref('Practitioner', practitionerId)],
    // serviceTypeOffersService() matches on the service-type-reference extension.
    serviceType: services.map((svc) => ({
      ...serviceTypeConcept(svc),
      extension: [{ url: EXT.serviceTypeReference, valueReference: ref('HealthcareService', svc.id) }],
    })),
    comment: s.comment,
    // One SchedulingParameters extension per service; getScheduleSchedulingParameters only
    // picks extensions whose `service` sub-extension references the requested HealthcareService.
    extension: services.map((svc) => ({
      url: EXT.schedulingParameters,
      extension: [
        { url: 'service', valueReference: ref('HealthcareService', svc.id) },
        availabilityExtension(s.availability),
        ...(config.timezone ? [{ url: 'timezone', valueCode: config.timezone }] : []),
      ],
    })),
  });
}

export function buildQuestionnaire(config) {
  const q = config.questionnaire;
  return clean({
    resourceType: 'Questionnaire',
    url: q.url,
    version: q.version,
    name: q.name,
    title: q.title,
    status: 'active',
    subjectType: ['Patient'],
    publisher: config.clinic.name,
    description: q.description,
    item: q.item,
  });
}

export function buildPatientAccessPolicy() {
  const READ = ['read', 'vread', 'search', 'history'];
  const readOnly = (resourceType) => ({ resourceType, interaction: READ });
  return {
    resourceType: 'AccessPolicy',
    name: PATIENT_ACCESS_POLICY_NAME,
    // Deliberately NO top-level `compartment`: repo.ts would stamp it as meta.account on every
    // resource the patient creates — including the Slots $hold writes. Per-resource `criteria`
    // with %patient (substituted in accesspolicy.ts buildAccessPolicyResources) is enough.
    resource: [
      // Clinic directory / booking config (no PHI)
      readOnly('Organization'),
      readOnly('Location'),
      readOnly('Practitioner'),
      readOnly('PractitionerRole'),
      readOnly('HealthcareService'),
      readOnly('Schedule'),
      readOnly('Questionnaire'),
      // $find/$hold search every Slot on the schedule (busy times, no PHI);
      // $hold creates Slots (busy-tentative); $cancel DELETES the appointment's Slots.
      { resourceType: 'Slot', interaction: ['read', 'vread', 'search', 'create', 'update', 'delete'] },
      // Patient compartment
      {
        resourceType: 'Patient',
        criteria: 'Patient?_id=%patient.id',
        interaction: ['read', 'vread', 'search', 'history', 'update'],
        readonlyFields: ['identifier', 'link', 'managingOrganization'],
      },
      {
        resourceType: 'Appointment',
        criteria: 'Appointment?patient=%patient',
        interaction: ['read', 'vread', 'search', 'history', 'create', 'update'],
      },
      {
        resourceType: 'QuestionnaireResponse',
        criteria: 'QuestionnaireResponse?subject=%patient',
        interaction: ['read', 'vread', 'search', 'history', 'create', 'update'],
      },
    ],
  };
}

// Connect owns its Appointment Subscription (caredevi-connect
// app/services/medplum/subscription_config.py, spec key "appointment-status").
// ONE Connect subscription per environment: provision.mjs only writes it with
// --with-connect-subscription, and then byte-for-byte the same body Connect builds
// (same tag → same resource, so either tool re-running updates it in place).
export const CONNECT_SUBSCRIPTION_KEY = 'appointment-status';
export const CONNECT_MAX_ATTEMPTS = 5; // Connect DEFAULT_MAX_ATTEMPTS
export const BACKEND_SUBSCRIPTION_KEY = 'booking-pilot-backend';

/**
 * kind: 'connect' | 'backend'. Returns undefined when the env needed for it is missing.
 */
export function buildSubscription(kind, env) {
  if (kind === 'connect') {
    if (!env.CONNECT_PUBLIC_BASE_URL) return undefined;
    const secret = env.MEDPLUM_WEBHOOK_SECRET;
    if (!secret) throw new Error('MEDPLUM_WEBHOOK_SECRET is required for the Connect subscription (Connect refuses unsigned subscriptions)');
    // Connect: token falls back to the secret when MEDPLUM_WEBHOOK_TOKEN is unset.
    const token = env.CONNECT_SUBSCRIPTION_TOKEN || secret;
    return {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'Connect: Appointment pending/booked/cancelled -> booking write-back',
      criteria: 'Appointment?status=pending,booked,cancelled',
      channel: {
        type: 'rest-hook',
        endpoint: `${trimSlash(env.CONNECT_PUBLIC_BASE_URL)}/api/v1/fhir/subscription/medplum/${token}`,
        payload: 'application/fhir+json',
      },
      extension: [
        { url: EXT.subscriptionSecret, valueString: secret },
        { url: EXT.subscriptionMaxAttempts, valueInteger: CONNECT_MAX_ATTEMPTS },
        { url: EXT.subscriptionInteraction, valueCode: 'create' },
        { url: EXT.subscriptionInteraction, valueCode: 'update' },
      ],
      meta: { tag: [{ system: SYS.subscription, code: CONNECT_SUBSCRIPTION_KEY }] },
    };
  }
  if (kind !== 'backend') throw new Error(`Unknown subscription kind ${kind}`);
  if (!env.BACKEND_PUBLIC_URL) return undefined;
  const extension = [
    // Delete events carry no resource body; only create/update are useful here.
    { url: EXT.subscriptionInteraction, valueCode: 'create' },
    { url: EXT.subscriptionInteraction, valueCode: 'update' },
  ];
  if (env.BACKEND_MEDPLUM_WEBHOOK_SECRET) {
    extension.unshift({ url: EXT.subscriptionSecret, valueString: env.BACKEND_MEDPLUM_WEBHOOK_SECRET });
  }
  return {
    resourceType: 'Subscription',
    meta: { tag: [{ system: SYS.subscription, code: BACKEND_SUBSCRIPTION_KEY }] },
    status: 'active',
    reason: 'CareDevi booking pilot: backend push notification on booked/cancelled',
    criteria: 'Appointment?status=booked,cancelled',
    channel: {
      type: 'rest-hook',
      endpoint: `${trimSlash(env.BACKEND_PUBLIC_URL)}/api/integrations/medplum/appointments`,
      payload: 'application/fhir+json',
    },
    extension,
  };
}

const trimSlash = (s) => String(s).replace(/\/+$/, '');

// Conditional-update search for each resource ("<Type>?<query>").
export function upsertQuery(resource) {
  const enc = (s) => encodeURIComponent(s);
  switch (resource.resourceType) {
    case 'Questionnaire':
      return `url=${enc(resource.url)}`;
    case 'AccessPolicy':
      return `name:exact=${enc(resource.name)}`;
    case 'Subscription': {
      const t = resource.meta.tag[0];
      return `_tag=${enc(`${t.system}|${t.code}`)}`;
    }
    default: {
      const id = resource.identifier?.[0];
      if (!id) throw new Error(`${resource.resourceType} has no identifier to upsert by`);
      return `identifier=${enc(`${id.system}|${id.value}`)}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

export function validateConfig(config) {
  const errs = [];
  const need = (cond, msg) => cond || errs.push(msg);
  need(config.clinic?.slug && config.clinic?.name, 'clinic.slug and clinic.name are required');
  need(config.location?.slug, 'location.slug is required');
  need(config.timezone, 'timezone (IANA, e.g. America/Chicago) is required — Medplum $find fails with "No timezone specified" otherwise');
  need(Array.isArray(config.practitioners) && config.practitioners.length, 'practitioners[] is required');
  need(Array.isArray(config.services) && config.services.length, 'services[] is required');
  need(Array.isArray(config.schedules) && config.schedules.length, 'schedules[] is required');
  if (config.timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: config.timezone });
    } catch {
      errs.push(`timezone "${config.timezone}" is not a valid IANA zone`);
    }
  }
  const pSlugs = new Set((config.practitioners ?? []).map((p) => p.slug));
  const sSlugs = new Set((config.services ?? []).map((s) => s.slug));
  for (const s of config.services ?? []) {
    need(Number.isInteger(s.durationMinutes) && s.durationMinutes > 0, `service ${s.slug}: durationMinutes must be a positive integer`);
    need(Array.isArray(s.bookingConfig?.modes) && s.bookingConfig.modes.length, `service ${s.slug}: bookingConfig.modes[] is required`);
    for (const m of s.bookingConfig?.modes ?? []) {
      need(['phone', 'video', 'in-person'].includes(m.code), `service ${s.slug}: mode code "${m.code}" must be phone|video|in-person`);
    }
    const bc = s.bookingConfig ?? {};
    if (bc.minNoticeMinutes !== undefined)
      need(Number.isInteger(bc.minNoticeMinutes) && bc.minNoticeMinutes >= 0, `service ${s.slug}: bookingConfig.minNoticeMinutes must be a non-negative integer`);
    if (bc.requiresMembership !== undefined)
      need(typeof bc.requiresMembership === 'boolean', `service ${s.slug}: bookingConfig.requiresMembership must be true or false`);
    // A free intro visit (e.g. the meet-and-greet) is how non-members find the clinic — never gate it.
    need(!(bc.isFree === true && bc.requiresMembership === true), `service ${s.slug}: a free service can't require membership`);
    if (s.intakeQuestionnaire) need(config.questionnaire?.url, `service ${s.slug}: intakeQuestionnaire set but questionnaire.url missing`);
  }
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  for (const sc of config.schedules ?? []) {
    need(pSlugs.has(sc.practitioner), `schedule ${sc.slug}: unknown practitioner "${sc.practitioner}"`);
    for (const sv of sc.services ?? []) need(sSlugs.has(sv), `schedule ${sc.slug}: unknown service "${sv}"`);
    need(sc.services?.length, `schedule ${sc.slug}: services[] is required`);
    need(sc.availability?.length, `schedule ${sc.slug}: availability[] is required`);
    for (const w of sc.availability ?? []) {
      need(w.daysOfWeek?.every((d) => DAYS.includes(d)), `schedule ${sc.slug}: daysOfWeek must be mon..sun`);
      if (!w.allDay) {
        try {
          fhirTime(w.start);
          fhirTime(w.end);
        } catch (e) {
          errs.push(`schedule ${sc.slug}: ${e.message}`);
        }
      }
    }
  }
  if (errs.length) throw new Error(`Invalid config:\n  - ${errs.join('\n  - ')}`);
}

// ---------------------------------------------------------------------------
// Medplum client (tiny)
// ---------------------------------------------------------------------------

class Medplum {
  constructor({ baseUrl, clientId, clientSecret, dryRun, log }) {
    this.baseUrl = trimSlash(baseUrl ?? 'https://medplum.invalid');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.dryRun = dryRun;
    this.log = log;
    this.token = undefined;
  }

  async login() {
    if (this.dryRun) {
      this.log(`[dry-run] POST ${this.baseUrl}/oauth2/token (grant_type=client_credentials)`);
      return;
    }
    const res = await fetch(`${this.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error(`Token request failed (${res.status}): ${JSON.stringify(body)}`);
    this.token = body.access_token;
  }

  /** Conditional update. Returns the stored resource (with id). */
  async upsert(resource, display = resource) {
    const url = `${this.baseUrl}/fhir/R4/${resource.resourceType}?${upsertQuery(resource)}`;
    if (this.dryRun) {
      this.log(`\n[dry-run] PUT ${url}\n${JSON.stringify(display, null, 2)}`);
      return { ...resource, id: dryRunId(resource) };
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/fhir+json',
        Accept: 'application/fhir+json',
      },
      body: JSON.stringify(resource),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const issues = (body.issue ?? []).map((i) => `${i.severity}: ${i.details?.text ?? i.diagnostics ?? ''} ${i.expression ?? ''}`).join('; ');
      throw new Error(`PUT ${resource.resourceType}?${upsertQuery(resource)} failed (${res.status}): ${issues || JSON.stringify(body)}`);
    }
    this.log(`${res.status === 201 ? 'created' : 'updated'} ${body.resourceType}/${body.id}`);
    return body;
  }
}

function dryRunId(resource) {
  const key =
    resource.identifier?.[0]?.value ?? resource.meta?.tag?.[0]?.code ?? resource.name ?? resource.url ?? 'x';
  return `dry-run-${String(key).replace(/[^A-Za-z0-9.-]/g, '-').toLowerCase()}`.slice(0, 64);
}

/** Copy of a subscription with the secret masked, for logging. */
function redactSubscription(sub) {
  return {
    ...sub,
    channel: { ...sub.channel, endpoint: sub.channel.endpoint.replace(/(\/subscription\/medplum\/)[^/]+$/, '$1***') },
    extension: sub.extension.map((e) => (e.url === EXT.subscriptionSecret ? { ...e, valueString: '***' } : e)),
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function provision(config, { env, dryRun, skipSubscriptions, withConnectSubscription = false, log = console.log }) {
  validateConfig(config);
  const client = new Medplum({
    baseUrl: env.MEDPLUM_BASE_URL,
    clientId: env.MEDPLUM_CLIENT_ID,
    clientSecret: env.MEDPLUM_CLIENT_SECRET,
    dryRun,
    log,
  });
  await client.login();

  const org = await client.upsert(buildOrganization(config));
  const location = await client.upsert(buildLocation(config, org.id));

  const practitioners = new Map();
  for (const p of config.practitioners) {
    practitioners.set(p.slug, await client.upsert(buildPractitioner(config, p)));
  }

  // Questionnaire before HealthcareService so the canonical in intake-questionnaire resolves.
  const questionnaire = config.questionnaire ? await client.upsert(buildQuestionnaire(config)) : undefined;

  const services = new Map();
  for (const s of config.services) {
    const hs = await client.upsert(buildHealthcareService(config, s, { orgId: org.id, locationId: location.id }));
    services.set(s.slug, { ...s, id: hs.id });
  }

  for (const p of config.practitioners) {
    const offered = config.schedules.filter((sc) => sc.practitioner === p.slug).flatMap((sc) => sc.services);
    const serviceIds = [...new Set(offered)].map((slug) => services.get(slug).id);
    await client.upsert(
      buildPractitionerRole(config, p, { practitionerId: practitioners.get(p.slug).id, orgId: org.id, locationId: location.id, serviceIds })
    );
  }

  const schedules = [];
  for (const sc of config.schedules) {
    const schedule = await client.upsert(
      buildSchedule(config, sc, {
        practitionerId: practitioners.get(sc.practitioner).id,
        services: sc.services.map((slug) => services.get(slug)),
      })
    );
    schedules.push({ slug: sc.slug, id: schedule.id, services: sc.services });
  }

  const accessPolicy = await client.upsert(buildPatientAccessPolicy());

  const subscriptions = [];
  if (!skipSubscriptions) {
    // In dry-run, show the subscriptions even without env (placeholders).
    const subEnv = dryRun
      ? {
          CONNECT_PUBLIC_BASE_URL: '<CONNECT_PUBLIC_BASE_URL>',
          CONNECT_SUBSCRIPTION_TOKEN: '<CONNECT_SUBSCRIPTION_TOKEN>',
          MEDPLUM_WEBHOOK_SECRET: '<MEDPLUM_WEBHOOK_SECRET>',
          BACKEND_PUBLIC_URL: '<BACKEND_PUBLIC_URL>',
          BACKEND_MEDPLUM_WEBHOOK_SECRET: '<BACKEND_MEDPLUM_WEBHOOK_SECRET>',
          ...Object.fromEntries(Object.entries(env).filter(([, v]) => v)),
        }
      : env;
    if (!withConnectSubscription) {
      log(
        `\n(not writing the Connect subscription — caredevi-connect scripts/configure_medplum_subscriptions.py owns it;` +
          ` pass --with-connect-subscription to write the identical "${SYS.subscription}|${CONNECT_SUBSCRIPTION_KEY}" resource from here)`
      );
    }
    for (const kind of withConnectSubscription ? ['connect', 'backend'] : ['backend']) {
      const sub = buildSubscription(kind, subEnv);
      if (!sub) {
        log(`\n(skipping ${kind} subscription — required env vars not set)`);
        continue;
      }
      const saved = await client.upsert(sub, redactSubscription(sub));
      subscriptions.push({ kind, id: saved.id, criteria: sub.criteria, hasSecret: sub.extension.some((e) => e.url === EXT.subscriptionSecret) });
    }
  }

  const summary = {
    organization: { id: org.id, slug: config.clinic.slug },
    location: { id: location.id },
    practitioners: [...practitioners].map(([slug, p]) => ({ slug, id: p.id })),
    healthcareServices: [...services.values()].map((s) => ({ slug: s.slug, id: s.id })),
    schedules,
    questionnaireUrl: questionnaire?.url,
    questionnaireId: questionnaire?.id,
    accessPolicyId: accessPolicy.id,
    subscriptions,
  };
  printSummary(summary, { dryRun, baseUrl: client.baseUrl, log });
  return summary;
}

function printSummary(s, { dryRun, baseUrl, log }) {
  const svc = s.healthcareServices[0];
  const sch = s.schedules.find((x) => x.services.includes(svc?.slug)) ?? s.schedules[0];
  log(`
==================== CareDevi booking pilot — provisioned${dryRun ? ' (DRY RUN — ids are placeholders)' : ''} ====================
Organization        ${s.organization.id}   (${s.organization.slug})
Location            ${s.location.id}
Practitioner(s)     ${s.practitioners.map((p) => `${p.slug}=${p.id}`).join(', ')}
HealthcareService   ${s.healthcareServices.map((x) => `${x.slug}=${x.id}`).join(', ')}
Schedule(s)         ${s.schedules.map((x) => `${x.slug}=${x.id}`).join(', ')}
Questionnaire url   ${s.questionnaireUrl ?? '-'}   (id ${s.questionnaireId ?? '-'})
AccessPolicy        ${s.accessPolicyId}   ("${PATIENT_ACCESS_POLICY_NAME}")
Subscriptions       ${s.subscriptions.length ? s.subscriptions.map((x) => `${x.kind}=${x.id} [${x.criteria}]${x.hasSecret ? '' : ' (NO SECRET!)'}`).join(', ') : 'none'}

Backend env:
  MEDPLUM_PATIENT_ACCESS_POLICY_ID=${s.accessPolicyId}

MANUAL STEPS (see README.md):
  1. Backend ClientApplication's ProjectMembership: set admin=true (required for x-medplum-on-behalf-of).
  2. Every booking Patient needs a ProjectMembership (profile=Patient/<id>) with accessPolicy=AccessPolicy/${s.accessPolicyId}.
  3. Connect gets its OWN ClientApplication (admin, or a policy allowing Appointment/Slot read+update, Patient read).
     ONE Connect subscription per environment (tag ${SYS.subscription}|${CONNECT_SUBSCRIPTION_KEY}) — normally created by
     caredevi-connect scripts/configure_medplum_subscriptions.py.
     Connect MEETING_TIMEZONE / MEETING_WORK_START / MEETING_WORK_END must equal the Schedule availability
     (see README) or Connect cancels bookings as outside working hours.
  4. Connect/backend must verify X-Signature = hex HMAC-SHA256(raw body, secret) with the same secrets passed here.
  5. Smoke test:
     curl -s -H "Authorization: Bearer $TOKEN" \\
       "${baseUrl}/fhir/R4/Appointment/\\$find?start=<ISO>&end=<ISO>&service-type-reference=HealthcareService/${svc?.id}&schedule=Schedule/${sch?.id}"
`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const opts = {
    config: path.join(scriptDir, 'clinics', 'precision-dpc.json'),
    dryRun: false,
    skipSubscriptions: false,
    withConnectSubscription: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--skip-subscriptions') opts.skipSubscriptions = true;
    else if (a === '--with-connect-subscription') opts.withConnectSubscription = true;
    else if (a === '--config') opts.config = path.resolve(argv[++i] ?? '');
    else if (a.startsWith('--config=')) opts.config = path.resolve(a.slice('--config='.length));
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('Usage: node provision.mjs [--config <file>] [--dry-run] [--skip-subscriptions] [--with-connect-subscription]');
    return;
  }
  const env = process.env;
  if (!opts.dryRun) {
    const missing = ['MEDPLUM_BASE_URL', 'MEDPLUM_CLIENT_ID', 'MEDPLUM_CLIENT_SECRET'].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Missing env: ${missing.join(', ')} (or use --dry-run)`);
  }
  const config = JSON.parse(await readFile(opts.config, 'utf8'));
  console.log(`Config: ${opts.config}${opts.dryRun ? '  [dry-run: no network calls]' : ''}`);
  await provision(config, {
    env,
    dryRun: opts.dryRun,
    skipSubscriptions: opts.skipSubscriptions,
    withConnectSubscription: opts.withConnectSubscription,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  });
}
