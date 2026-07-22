import { MedplumClient, getReferenceString } from '@medplum/core';

const medplum = new MedplumClient({ baseUrl: 'http://localhost:8103/', fetch: fetch.bind(globalThis) });
const loginResp = await medplum.startLogin({ email: 'everett@scheduling-demo.local', password: 'medplum123' });
await medplum.processCode(loginResp.code);

const consult = await medplum.searchOne(
  'HealthcareService',
  'identifier=https://medplum.com/fhir/candid-scheduling-demo|urology-consult-followup'
);
console.log('Consult service:', getReferenceString(consult));

const schedules = await medplum.searchResources('Schedule', { _count: 100 });
const byIdentifier = (val) => schedules.find((s) => s.identifier?.some((i) => i.value === val));
const reyesSchedule = byIdentifier('schedule-practitioner-reyes');
const roomASchedule = byIdentifier('schedule-procedure-room-a');

const start = new Date();
start.setDate(start.getDate() + 2);
start.setHours(0, 0, 0, 0);
const end = new Date(start);
end.setDate(end.getDate() + 10);

const url = medplum.fhirUrl('Appointment', '$find');
url.searchParams.append('start', start.toISOString());
url.searchParams.append('end', end.toISOString());
url.searchParams.append('service-type-reference', getReferenceString(consult));
[reyesSchedule, roomASchedule].forEach((s) => url.searchParams.append('schedule', getReferenceString(s)));

const bundle = await medplum.get(url);
const proposed = (bundle.entry ?? []).map((e) => e.resource);
console.log(`Consult (Reyes + Room A, no Device) proposed appointments: ${proposed.length}`);
if (proposed.length > 0) {
  const durationMin = (new Date(proposed[0].end) - new Date(proposed[0].start)) / 60000;
  console.log(`First proposed slot duration: ${durationMin} min (expect 20, the Consult service's own duration)`);
  console.log('Participants:', proposed[0].participant.map((p) => getReferenceString(p.actor)));
}
