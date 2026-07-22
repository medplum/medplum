import { MedplumClient } from '@medplum/core';
import { extractReferencesFromCodeableReferenceLike, toCodeableReferenceLike } from '../src/utils/servicetype';

const SYSTEM = 'https://medplum.com/fhir/candid-scheduling-demo';

async function main(): Promise<void> {
  const medplum = new MedplumClient({ baseUrl: 'http://localhost:8103/', fetch: fetch.bind(globalThis) });
  const loginResp = await medplum.startLogin({ email: 'everett@scheduling-demo.local', password: 'medplum123' });
  await medplum.processCode(loginResp.code);

  const cystoscopy = await medplum.readResource('HealthcareService', '05fe9c74-a986-425b-91a4-bd3da4c9a707');
  const serviceType = toCodeableReferenceLike(cystoscopy);

  const appts = await medplum.searchResources('Appointment', { identifier: `${SYSTEM}|`, _count: '1000' });
  let patched = 0;
  for (const appt of appts) {
    if (!appt.serviceType || appt.serviceType.length === 0) {
      await medplum.updateResource({ ...appt, serviceType });
      patched++;
    }
  }
  console.log(`Seeded appointments: ${appts.length}, patched with serviceType: ${patched}`);

  // Verify reschedule resolution: a seeded appointment now yields a
  // HealthcareService ref that Find & Book can pre-fill.
  const sample = (await medplum.searchResources('Appointment', { identifier: `${SYSTEM}|`, _count: '1' }))[0];
  const refs = extractReferencesFromCodeableReferenceLike(sample?.serviceType);
  console.log('Sample appointment serviceType resolves to:', refs[0]?.reference ?? '(none)');

  const pending = await medplum.searchResources('Appointment', { status: 'pending', identifier: `${SYSTEM}|`, _count: '5' });
  console.log(
    'Pending appointments now carry serviceType:',
    pending.every((p) => (p.serviceType?.length ?? 0) > 0)
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
