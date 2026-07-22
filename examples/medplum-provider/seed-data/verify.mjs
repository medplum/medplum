import { MedplumClient, createReference, getReferenceString } from '@medplum/core';

const medplum = new MedplumClient({ baseUrl: 'http://localhost:8103/', fetch: fetch.bind(globalThis) });
const loginResp = await medplum.startLogin({ email: 'everett@scheduling-demo.local', password: 'medplum123' });
await medplum.processCode(loginResp.code);
console.log('logged in');

const hcs = await medplum.searchOne('HealthcareService', 'identifier=https://medplum.com/fhir/candid-scheduling-demo|cystoscopy-urology-procedure');
console.log('hcs', getReferenceString(hcs));

const schedules = await medplum.searchResources('Schedule', { _count: 100 });
const byIdentifier = (val) => schedules.find((s) => s.identifier?.some((i) => i.value === val));
const chenSchedule = byIdentifier('schedule-practitioner-chen');
const reyesSchedule = byIdentifier('schedule-practitioner-reyes');
const roomASchedule = byIdentifier('schedule-procedure-room-a');
const roomBSchedule = byIdentifier('schedule-procedure-room-b');
const deviceSchedule = byIdentifier('schedule-cystoscopy-ultrasound-unit-1');
console.log('schedules resolved:', [chenSchedule, reyesSchedule, roomASchedule, roomBSchedule, deviceSchedule].map((s) => !!s));

// Search a window covering both the free days and the deliberately busy Tue/Thu windows.
const start = new Date();
start.setDate(start.getDate() + 2);
start.setHours(0, 0, 0, 0);
const end = new Date(start);
end.setDate(end.getDate() + 10);

async function find(schedules) {
  const url = medplum.fhirUrl('Appointment', '$find');
  url.searchParams.append('start', start.toISOString());
  url.searchParams.append('end', end.toISOString());
  url.searchParams.append('service-type-reference', getReferenceString(hcs));
  schedules.forEach((s) => url.searchParams.append('schedule', getReferenceString(s)));
  const bundle = await medplum.get(url);
  return (bundle.entry ?? []).map((e) => e.resource);
}

// Combo A: Chen + Room A + Device
const comboA = await find([chenSchedule, roomASchedule, deviceSchedule]);
console.log(`Combo A (Chen/RoomA/Device): ${comboA.length} proposed appointments`);

// Combo B: Reyes + Room B + Device
const comboB = await find([reyesSchedule, roomBSchedule, deviceSchedule]);
console.log(`Combo B (Reyes/RoomB/Device): ${comboB.length} proposed appointments`);

// Verify the deliberately busy Tue 10:00 slot (Dr. Chen) is excluded from combo A
const chenBusyStart = comboA.find((a) => {
  const s = new Date(a.start);
  return s.getUTCDay() === 2 && s.getUTCHours() === 17; // Tue 17:00 UTC == 10:00 America not exact tz but matches our stored UTC time
});
console.log('Combo A includes the seeded Chen-busy time (should be undefined):', chenBusyStart);

if (comboB.length === 0) {
  throw new Error('Expected at least one available combo B appointment');
}

// Book combo B's first proposed appointment
const patient = await medplum.searchOne('Patient', 'identifier=https://medplum.com/fhir/candid-scheduling-demo|patient-3');
const proposed = comboB[0];
const booking = {
  ...proposed,
  participant: [...proposed.participant, { actor: createReference(patient), status: 'accepted', required: 'required' }],
};

const bookResult = await medplum.post(medplum.fhirUrl('Appointment', '$book'), {
  resourceType: 'Parameters',
  parameter: [{ name: 'appointment', resource: booking }],
});

const bookedAppointment = bookResult.entry.map((e) => e.resource).find((r) => r.resourceType === 'Appointment');
const bookedSlots = bookResult.entry.map((e) => e.resource).filter((r) => r.resourceType === 'Slot');
console.log(`Booked appointment: ${getReferenceString(bookedAppointment)}, status=${bookedAppointment.status}`);
console.log(`Slots created: ${bookedSlots.length} (expect 3: provider, room, device)`);
console.log('Appointment participants:', bookedAppointment.participant.map((p) => getReferenceString(p.actor)));

// Re-search combo B: should no longer include the just-booked time
const comboBAfter = await find([reyesSchedule, roomBSchedule, deviceSchedule]);
const stillThere = comboBAfter.some((a) => a.start === bookedAppointment.start);
console.log('Just-booked time still appears in re-search (should be false):', stillThere);

// --- Encounter creation check (mirrors BookAppointmentForm.bookEncounter) ---
const SchedulingPlanDefinitionURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingPlanDefinition';
const SchedulingEncounterCodingURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingEncounterCoding';

function getExtValue(resource, url) {
  return resource.extension?.find((e) => e.url === url);
}

const planDefExt = getExtValue(hcs, SchedulingPlanDefinitionURI);
const encounterCodingExt = getExtValue(hcs, SchedulingEncounterCodingURI);
console.log('HealthcareService has PlanDefinition ext:', !!planDefExt, ' EncounterCoding ext:', !!encounterCodingExt);

const practitioners = bookedAppointment.participant.map((p) => p.actor).filter((a) => a.reference?.startsWith('Practitioner/'));
const patients = bookedAppointment.participant.map((p) => p.actor).filter((a) => a.reference?.startsWith('Patient/'));
console.log(`Participant counts -> practitioners: ${practitioners.length}, patients: ${patients.length} (encounter creation requires exactly 1 of each)`);

if (practitioners.length === 1 && patients.length === 1 && planDefExt && encounterCodingExt) {
  const planDefinition = await medplum.readReference(planDefExt.valueReference);
  const encounter = await medplum.createResource({
    resourceType: 'Encounter',
    status: 'planned',
    statusHistory: [],
    classHistory: [],
    class: encounterCodingExt.valueCoding,
    subject: patients[0],
    appointment: [createReference(bookedAppointment)],
    participant: [{ individual: practitioners[0] }],
  });
  console.log('Encounter created:', getReferenceString(encounter), 'class:', JSON.stringify(encounter.class));

  await medplum.post(medplum.fhirUrl('PlanDefinition', planDefinition.id, '$apply'), {
    resourceType: 'Parameters',
    parameter: [
      { name: 'subject', valueString: getReferenceString(patients[0]) },
      { name: 'encounter', valueString: getReferenceString(encounter) },
      { name: 'practitioner', valueString: getReferenceString(practitioners[0]) },
    ],
  });
  console.log('PlanDefinition/$apply succeeded with Location+Device participants present on the source Appointment');
} else {
  console.log('SKIPPED encounter creation check - missing prerequisite (see counts/extensions above)');
}

console.log('\nAll verification checks completed.');
