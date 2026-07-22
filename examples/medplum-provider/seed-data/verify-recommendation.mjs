import { MedplumClient, getReferenceString, parseReference } from '@medplum/core';

const medplum = new MedplumClient({ baseUrl: 'http://localhost:8103/', fetch: fetch.bind(globalThis) });
const loginResp = await medplum.startLogin({ email: 'everett@scheduling-demo.local', password: 'medplum123' });
await medplum.processCode(loginResp.code);

const cystoscopy = await medplum.searchOne(
  'HealthcareService',
  'identifier=https://medplum.com/fhir/candid-scheduling-demo|cystoscopy-urology-procedure'
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

async function find(scheds) {
  const url = medplum.fhirUrl('Appointment', '$find');
  url.searchParams.append('start', start.toISOString());
  url.searchParams.append('end', end.toISOString());
  url.searchParams.append('service-type-reference', getReferenceString(cystoscopy));
  scheds.forEach((s) => url.searchParams.append('schedule', getReferenceString(s)));
  const bundle = await medplum.get(url);
  return (bundle.entry ?? []).map((e) => e.resource);
}

const combos = [
  { key: 'chen+roomA', schedules: [chen, roomA, device] },
  { key: 'chen+roomB', schedules: [chen, roomB, device] },
  { key: 'reyes+roomA', schedules: [reyes, roomA, device] },
  { key: 'reyes+roomB', schedules: [reyes, roomB, device] },
];

const allSlots = [];
for (const combo of combos) {
  const results = await find(combo.schedules);
  for (const appointment of results) {
    allSlots.push({ combo, appointment });
  }
}

// Group by exact start time
const byStart = new Map();
for (const slot of allSlots) {
  const key = slot.appointment.start;
  const group = byStart.get(key) ?? [];
  group.push(slot);
  byStart.set(key, group);
}

// Provider booking counts over a 4-week window (mirrors the app's loadBalanceRange)
const loadStart = new Date();
loadStart.setDate(loadStart.getDate() + 0);
const loadEnd = new Date(loadStart.getTime() + 28 * 24 * 60 * 60 * 1000);
const counts = new Map();
for (const [label, sched] of [['chen', chen], ['reyes', reyes]]) {
  const providerRef = sched.actor[0];
  const bundle = await medplum.search('Appointment', [
    ['actor', getReferenceString(providerRef)],
    ['status', 'booked'],
    ['date', `ge${loadStart.toISOString()}`],
    ['date', `le${loadEnd.toISOString()}`],
    ['_summary', 'count'],
  ]);
  counts.set(getReferenceString(providerRef), bundle.total ?? 0);
  console.log(`${label} booked count (4wk window): ${bundle.total}`);
}

let multiComboGroups = 0;
let multiProviderGroups = 0;
let sameProviderTies = 0;

for (const [startTime, group] of byStart) {
  if (group.length < 2) continue;
  multiComboGroups++;
  const providers = new Set(
    group.map((s) => getReferenceString(s.combo.schedules.find((sch) => parseReference(sch.actor[0])[0] === 'Practitioner').actor[0]))
  );
  if (providers.size > 1) {
    multiProviderGroups++;
  } else {
    sameProviderTies++;
  }
}

console.log(`\nTotal same-start-time groups with >=2 combos: ${multiComboGroups}`);
console.log(`  - groups with 2+ DIFFERENT providers (real recommendation possible): ${multiProviderGroups}`);
console.log(`  - groups with the SAME provider only (room/device tie, no real signal): ${sameProviderTies}`);
