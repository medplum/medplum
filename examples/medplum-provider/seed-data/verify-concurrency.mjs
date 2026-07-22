import { MedplumClient, createReference, getReferenceString } from '@medplum/core';

async function login() {
  const medplum = new MedplumClient({ baseUrl: 'http://localhost:8103/', fetch: fetch.bind(globalThis) });
  const loginResp = await medplum.startLogin({ email: 'everett@scheduling-demo.local', password: 'medplum123' });
  await medplum.processCode(loginResp.code);
  return medplum;
}

const medplum = await login();
const medplum2 = await login();

const hcs = await medplum.searchOne(
  'HealthcareService',
  'identifier=https://medplum.com/fhir/candid-scheduling-demo|cystoscopy-urology-procedure'
);
const schedules = await medplum.searchResources('Schedule', { _count: 100 });
const byIdentifier = (val) => schedules.find((s) => s.identifier?.some((i) => i.value === val));
const chenSchedule = byIdentifier('schedule-practitioner-chen');
const roomASchedule = byIdentifier('schedule-procedure-room-a');
const deviceSchedule = byIdentifier('schedule-cystoscopy-ultrasound-unit-1');

const start = new Date();
start.setDate(start.getDate() + 2);
start.setHours(0, 0, 0, 0);
const end = new Date(start);
end.setDate(end.getDate() + 10);

const url = medplum.fhirUrl('Appointment', '$find');
url.searchParams.append('start', start.toISOString());
url.searchParams.append('end', end.toISOString());
url.searchParams.append('service-type-reference', getReferenceString(hcs));
[chenSchedule, roomASchedule, deviceSchedule].forEach((s) => url.searchParams.append('schedule', getReferenceString(s)));

const bundle = await medplum.get(url);
const proposed = bundle.entry[0].resource;
console.log(`Proposed appointment to double-book: ${proposed.start}`);

const patient = await medplum.searchOne(
  'Patient',
  'identifier=https://medplum.com/fhir/candid-scheduling-demo|patient-4'
);

function bookWith(client) {
  const booking = {
    ...proposed,
    participant: [...proposed.participant, { actor: createReference(patient), status: 'accepted', required: 'required' }],
  };
  return client
    .post(client.fhirUrl('Appointment', '$book'), {
      resourceType: 'Parameters',
      parameter: [{ name: 'appointment', resource: booking }],
    })
    .then(() => ({ ok: true }))
    .catch((err) => ({ ok: false, error: err.outcome?.issue?.[0]?.details?.text ?? err.message }));
}

const [r1, r2] = await Promise.all([bookWith(medplum), bookWith(medplum2)]);
console.log('Session 1:', r1);
console.log('Session 2:', r2);

const successes = [r1, r2].filter((r) => r.ok).length;
if (successes !== 1) {
  throw new Error(`Expected exactly 1 of 2 concurrent bookings to succeed, got ${successes}`);
}
console.log('\nConcurrency check passed: exactly one booking succeeded, the other got a clean conflict error.');
