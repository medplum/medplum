// node --test caredevi/booking-pilot/provision.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  availabilityExtension,
  buildHealthcareService,
  buildOrganization,
  buildPatientAccessPolicy,
  buildSchedule,
  buildSubscription,
  EXT,
  fhirTime,
  provision,
  SYS,
  upsertQuery,
  validateConfig,
} from './provision.mjs';

const config = JSON.parse(readFileSync(new URL('./clinics/precision-dpc.json', import.meta.url), 'utf8'));
const service = config.services[0];

const sub = (ext, url) => ext.extension.filter((e) => e.url === url);

test('config is valid', () => {
  assert.doesNotThrow(() => validateConfig(config));
});

test('validateConfig rejects missing timezone and unknown refs', () => {
  const bad = structuredClone(config);
  delete bad.timezone;
  bad.schedules[0].practitioner = 'nobody';
  assert.throws(() => validateConfig(bad), /timezone[\s\S]*unknown practitioner/);
});

test('meet-and-greet stays open to non-members', () => {
  const mg = config.services.find((s) => s.slug === config.clinic.content?.primaryCta?.serviceSlug) ?? service;
  assert.equal(mg.slug, 'precision-dpc-meet-and-greet');
  assert.notEqual(mg.bookingConfig.requiresMembership, true);
  const gated = structuredClone(config);
  gated.services[0].bookingConfig.requiresMembership = true;
  assert.throws(() => validateConfig(gated), /free service can't require membership/);
});

test('validateConfig checks minNoticeMinutes and requiresMembership types', () => {
  assert.equal(service.bookingConfig.minNoticeMinutes, 120);
  const bad = structuredClone(config);
  bad.services[0].bookingConfig.minNoticeMinutes = -5;
  bad.services[0].bookingConfig.requiresMembership = 'no';
  assert.throws(() => validateConfig(bad), /minNoticeMinutes must be a non-negative integer[\s\S]*requiresMembership must be true or false/);
});

test('fhirTime normalises', () => {
  assert.equal(fhirTime('9:00'), '09:00:00');
  assert.equal(fhirTime('17:00:00'), '17:00:00');
  assert.throws(() => fhirTime('25:00'));
});

test('Organization carries clinic identifier and app-content JSON', () => {
  const org = buildOrganization(config);
  assert.deepEqual(org.identifier, [{ system: SYS.clinic, value: 'precision-dpc' }]);
  const content = JSON.parse(org.extension.find((e) => e.url === EXT.appContent).valueString);
  assert.equal(content.primaryCta.serviceSlug, 'precision-dpc-meet-and-greet');
  assert.equal(content.faq.length, 8);
  assert.equal(upsertQuery(org), 'identifier=https%3A%2F%2Fcaredevi.com%2Fclinic%7Cprecision-dpc');
});

test('HealthcareService SchedulingParameters: duration/timezone, never availability/service', () => {
  const hs = buildHealthcareService(config, service, { orgId: 'o1', locationId: 'l1' });
  const sp = hs.extension.find((e) => e.url === EXT.schedulingParameters);
  assert.deepEqual(sub(sp, 'duration')[0].valueDuration.value, 30);
  assert.equal(sub(sp, 'duration')[0].valueDuration.unit, 'min');
  assert.equal(sub(sp, 'timezone')[0].valueCode, 'America/Chicago');
  assert.equal(sub(sp, 'availability').length, 0);
  assert.equal(sub(sp, 'service').length, 0);
  assert.equal(hs.extension.find((e) => e.url === EXT.intakeQuestionnaire).valueCanonical, config.questionnaire.url);
  const booking = JSON.parse(hs.extension.find((e) => e.url === EXT.bookingConfig).valueString);
  assert.deepEqual(booking.modes.map((m) => m.code), ['phone', 'in-person', 'video']);
  assert.equal(hs.providedBy.reference, 'Organization/o1');
});

test('Schedule: one actor, serviceType reference, per-service SchedulingParameters with availability + timezone', () => {
  const s = buildSchedule(config, config.schedules[0], { practitionerId: 'p1', services: [{ ...service, id: 'hs1' }] });
  assert.equal(s.actor.length, 1);
  assert.equal(s.actor[0].reference, 'Practitioner/p1');
  assert.equal(
    s.serviceType[0].extension.find((e) => e.url === EXT.serviceTypeReference).valueReference.reference,
    'HealthcareService/hs1'
  );
  const sp = s.extension.find((e) => e.url === EXT.schedulingParameters);
  assert.equal(sub(sp, 'service')[0].valueReference.reference, 'HealthcareService/hs1');
  assert.equal(sub(sp, 'timezone')[0].valueCode, 'America/Chicago');
  const avail = sub(sp, 'availability')[0];
  const slot = avail.extension[0];
  assert.equal(slot.url, 'availableTime');
  assert.deepEqual(sub(slot, 'daysOfWeek').map((e) => e.valueCode), ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.equal(sub(slot, 'availableStartTime')[0].valueTime, '09:00:00');
  assert.equal(sub(slot, 'availableEndTime')[0].valueTime, '17:00:00');
});

test('availabilityExtension allDay', () => {
  const a = availabilityExtension([{ daysOfWeek: ['sat'], allDay: true }]);
  assert.deepEqual(a.extension[0].extension, [
    { url: 'daysOfWeek', valueCode: 'sat' },
    { url: 'allDay', valueBoolean: true },
  ]);
});

test('AccessPolicy: compartment criteria and Slot writes for $hold/$cancel', () => {
  const ap = buildPatientAccessPolicy();
  const by = Object.fromEntries(ap.resource.map((r) => [r.resourceType, r]));
  assert.equal(by.Appointment.criteria, 'Appointment?patient=%patient');
  assert.equal(by.Patient.criteria, 'Patient?_id=%patient.id');
  assert.equal(by.QuestionnaireResponse.criteria, 'QuestionnaireResponse?subject=%patient');
  for (const i of ['create', 'update', 'delete', 'search']) assert.ok(by.Slot.interaction.includes(i), i);
  for (const t of ['Organization', 'Location', 'Practitioner', 'PractitionerRole', 'HealthcareService', 'Schedule', 'Questionnaire']) {
    assert.ok(!by[t].interaction.includes('create'), t);
  }
  assert.equal(ap.compartment, undefined);
  assert.equal(upsertQuery(ap), 'name:exact=CareDevi%20Patient');
});

test('Subscriptions: Connect body identical to caredevi-connect subscription_config.py; backend', () => {
  const env = {
    CONNECT_PUBLIC_BASE_URL: 'https://connect.example/',
    CONNECT_SUBSCRIPTION_TOKEN: 'tok',
    MEDPLUM_WEBHOOK_SECRET: 's1',
    BACKEND_PUBLIC_URL: 'https://api.example',
    BACKEND_MEDPLUM_WEBHOOK_SECRET: 's2',
  };
  const c = buildSubscription('connect', env);
  // Mirrors build_subscription(SubscriptionSpec("appointment-status", ...)) in Connect.
  assert.deepEqual(c, {
    resourceType: 'Subscription',
    status: 'active',
    reason: 'Connect: Appointment pending/booked/cancelled -> booking write-back',
    criteria: 'Appointment?status=pending,booked,cancelled',
    channel: {
      type: 'rest-hook',
      endpoint: 'https://connect.example/api/v1/fhir/subscription/medplum/tok',
      payload: 'application/fhir+json',
    },
    extension: [
      { url: 'https://www.medplum.com/fhir/StructureDefinition/subscription-secret', valueString: 's1' },
      { url: 'https://medplum.com/fhir/StructureDefinition/subscription-max-attempts', valueInteger: 5 },
      { url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction', valueCode: 'create' },
      { url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction', valueCode: 'update' },
    ],
    meta: { tag: [{ system: 'https://caredevi.com/subscription', code: 'appointment-status' }] },
  });
  assert.equal(upsertQuery(c), '_tag=https%3A%2F%2Fcaredevi.com%2Fsubscription%7Cappointment-status');
  // Token falls back to the secret (Connect get_expected_token()).
  const noTok = buildSubscription('connect', { ...env, CONNECT_SUBSCRIPTION_TOKEN: '' });
  assert.equal(noTok.channel.endpoint, 'https://connect.example/api/v1/fhir/subscription/medplum/s1');
  assert.throws(() => buildSubscription('connect', { CONNECT_PUBLIC_BASE_URL: 'https://c' }), /MEDPLUM_WEBHOOK_SECRET/);

  const b = buildSubscription('backend', env);
  assert.equal(b.criteria, 'Appointment?status=booked,cancelled');
  assert.equal(b.channel.endpoint, 'https://api.example/api/integrations/medplum/appointments');
  assert.equal(b.extension.find((e) => e.url === EXT.subscriptionSecret).valueString, 's2');
  assert.equal(buildSubscription('backend', {}), undefined);
});

test('dry-run provision resolves references and makes no network calls', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('network call in dry-run');
  };
  try {
    const lines = [];
    const summary = await provision(config, { env: {}, dryRun: true, skipSubscriptions: false, log: (l) => lines.push(l) });
    assert.equal(summary.healthcareServices.length, 1);
    // Connect subscription is NOT written by default (Connect owns it).
    assert.deepEqual(summary.subscriptions.map((s) => s.kind), ['backend']);
    const out = lines.join('\n');
    assert.match(out, /"reference": "HealthcareService\/dry-run-precision-dpc-meet-and-greet"/);
    assert.ok(!out.includes('<BACKEND_MEDPLUM_WEBHOOK_SECRET>'), 'secret must be redacted');

    const lines2 = [];
    const withConnect = await provision(config, {
      env: {},
      dryRun: true,
      skipSubscriptions: false,
      withConnectSubscription: true,
      log: (l) => lines2.push(l),
    });
    assert.deepEqual(withConnect.subscriptions.map((s) => s.kind), ['connect', 'backend']);
    assert.ok(!lines2.join('\n').includes('<MEDPLUM_WEBHOOK_SECRET>'), 'secret must be redacted');
  } finally {
    globalThis.fetch = realFetch;
  }
});
