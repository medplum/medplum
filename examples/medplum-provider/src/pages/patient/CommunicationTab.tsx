import { Communication, HumanName } from '@medplum/fhirtypes';
import { BaseChat, Loading, useMedplum, useMedplumProfile, Container } from '@medplum/react';
import { useCallback, useMemo, useState } from 'react';
import { usePatient } from '../../hooks/usePatient';
import { createReference, formatHumanName, getReferenceString } from '@medplum/core';
import { Alert } from '@mantine/core';

export function CommunicationTab(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const profileRef = useMemo(() => (profile ? createReference(profile) : undefined), [profile]);
  const patient = usePatient();
  const [communications, setCommunications] = useState<Communication[]>([]);

  const sendMessage = useCallback(
    (message: string) => {
      if (!patient) {
        return;
      }

      if (!profileRef) {
        return;
      }

      const patientRef = createReference(patient);

      medplum
        .createResource<Communication>({
          resourceType: 'Communication',
          status: 'in-progress',
          sender: profileRef,
          subject: patientRef,
          recipient: [patientRef],
          sent: new Date().toISOString(),
          payload: [{ contentString: message }],
        })
        .catch(console.error);
    },
    [medplum, patient, profileRef]
  );

  if (!profileRef) {
    return <Alert color="red">Error: Provider profile not found</Alert>;
  }

  if (!patient) {
    return <Loading />;
  }

  return (
    <Container size="sm">
      <BaseChat
        title={`Communications with ${formatHumanName(patient.name?.[0] as HumanName)}`}
        communications={communications}
        setCommunications={setCommunications}
        query={`subject=${getReferenceString(patient)}`}
        sendMessage={sendMessage}
        radius="sm"
        shadow="sm"
        h={600}
        mt="xl"
      />
    </Container>
  );
}
