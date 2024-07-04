import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Alert } from '@mantine/core';
import { Communication, HumanName, Patient, Practitioner } from '@medplum/fhirtypes';
import { createReference, formatGivenName, getReferenceString, normalizeErrorString } from '@medplum/core';
import { BaseChat, Document, useMedplum, useMedplumProfile, useResource } from '@medplum/react';
import { Loading } from '../components/Loading';
import { showNotification } from '@mantine/notifications';
import { IconCircleOff } from '@tabler/icons-react';

export function Messages(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Patient;
  const profileRef = useMemo(() => (profile ? createReference(profile) : undefined), [profile]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const { practitionerId } = useParams();
  const practitioner = useResource<Practitioner>({
    reference: `Practitioner/${practitionerId}`,
  });

  const sendMessage = useCallback(
    (content: string): void => {
      if (!practitioner) {
        return;
      }

      if (!profileRef) {
        return;
      }

      const practitionerRef = createReference(practitioner);

      medplum
        .createResource<Communication>({
          resourceType: 'Communication',
          status: 'in-progress',
          sender: profileRef,
          subject: profileRef,
          recipient: [practitionerRef],
          sent: new Date().toISOString(),
          payload: [{ contentString: content }],
        })
        .catch((err) => {
          showNotification({
            color: 'red',
            icon: <IconCircleOff />,
            title: 'Error',
            message: normalizeErrorString(err),
          });
        });
    },
    [medplum, profileRef, practitioner]
  );

  const handleMessageReceived = useCallback(
    (message: Communication): void => {
      if (message.received) {
        return;
      }

      medplum
        .updateResource<Communication>({
          ...message,
          status: 'completed',
          received: new Date().toISOString(),
        })
        .catch((err) => {
          showNotification({
            color: 'red',
            icon: <IconCircleOff />,
            title: 'Error',
            message: normalizeErrorString(err),
          });
        });
    },
    [medplum]
  );

  if (!profileRef) {
    return <Alert color="red">Error: Provider profile not found</Alert>;
  }

  if (!practitioner) {
    return <Loading />;
  }

  return (
    <Document width={800}>
      <BaseChat
        title={`Chat with ${formatGivenName(practitioner.name?.[0] as HumanName)}`}
        query={`sender=${getReferenceString(profile)},Practitioner/${practitionerId}&recipient=${getReferenceString(profile)},Practitioner/${practitionerId}`}
        communications={communications}
        setCommunications={setCommunications}
        sendMessage={sendMessage}
        onMessageReceived={handleMessageReceived}
        h={600}
      />
    </Document>
  );
}
