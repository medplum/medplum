import { MedPlumClient } from 'medplum';

export function getMedPlumClient() {
  return (window as any).medplum as MedPlumClient;
}
