import { MedplumClient, getReferenceString } from '@medplum/core';

const medplum = new MedplumClient({ baseUrl: 'http://localhost:8103/', fetch: fetch.bind(globalThis) });
const loginResp = await medplum.startLogin({ email: 'everett@scheduling-demo.local', password: 'medplum123' });
await medplum.processCode(loginResp.code);

const cystoscopy = await medplum.searchOne(
  'HealthcareService',
  'identifier=https://medplum.com/fhir/candid-scheduling-demo|cystoscopy-urology-procedure'
);
const consult = await medplum.searchOne(
  'HealthcareService',
  'identifier=https://medplum.com/fhir/candid-scheduling-demo|urology-consult-followup'
);

const schedules = await medplum.searchResources('Schedule', { _count: 100 });
const byIdentifier = (val) => schedules.find((s) => s.identifier?.some((i) => i.value === val));
const chen = byIdentifier('schedule-practitioner-chen');
const reyes = byIdentifier('schedule-practitioner-reyes');
const roomA = byIdentifier('schedule-procedure-room-a');
const roomB = byIdentifier('schedule-procedure-room-b');
const device = byIdentifier('schedule-cystoscopy-ultrasound-unit-1');

const start = new Date();
start.setDate(start.getDate() + 2);
start.setHours(0, 0, 0, 0);
const end = new Date(start);
end.setDate(end.getDate() + 12);

async function find(service, scheds) {
  const url = medplum.fhirUrl('Appointment', '$find');
  url.searchParams.append('start', start.toISOString());
  url.searchParams.append('end', end.toISOString());
  url.searchParams.append('service-type-reference', getReferenceString(service));
  scheds.forEach((s) => url.searchParams.append('schedule', getReferenceString(s)));
  const bundle = await medplum.get(url);
  return (bundle.entry ?? []).map((e) => e.resource);
}

console.log('--- Cystoscopy: all 4 provider x room combos (device fixed) ---');
const combos = [
  ['Chen + Room A', [chen, roomA, device]],
  ['Chen + Room B', [chen, roomB, device]],
  ['Reyes + Room A', [reyes, roomA, device]],
  ['Reyes + Room B', [reyes, roomB, device]],
];
let totalCystoscopy = 0;
const distinctTimes = new Set();
for (const [label, scheds] of combos) {
  const results = await find(cystoscopy, scheds);
  console.log(`  ${label}: ${results.length} proposed times`);
  totalCystoscopy += results.length;
  results.forEach((r) => distinctTimes.add(r.start));
}
console.log(`Total proposed (combos): ${totalCystoscopy}, distinct start times: ${distinctTimes.size}`);

console.log('\n--- Consult: all 4 provider x room combos (no device) ---');
let totalConsult = 0;
for (const [label, scheds] of [
  ['Chen + Room A', [chen, roomA]],
  ['Chen + Room B', [chen, roomB]],
  ['Reyes + Room A', [reyes, roomA]],
  ['Reyes + Room B', [reyes, roomB]],
]) {
  const results = await find(consult, scheds);
  console.log(`  ${label}: ${results.length} proposed times`);
  totalConsult += results.length;
}
console.log(`Total proposed (combos): ${totalConsult}`);
