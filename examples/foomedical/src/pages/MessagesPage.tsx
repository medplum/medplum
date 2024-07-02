import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Alert } from '@mantine/core';
import { Communication, HumanName, Patient, Practitioner } from '@medplum/fhirtypes';
import { createReference, formatGivenName, getReferenceString } from '@medplum/core';
import { BaseChat, Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { Loading } from '../components/Loading';

export function Messages(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Patient;
  const profileRef = useMemo(() => (profile ? createReference(profile) : undefined), [profile]);
  const [practitioner, setPractitioner] = useState<Practitioner>();
  const [communications, setCommunications] = useState<Communication[]>([]);
  const { practitionerId } = useParams();

  useEffect(() => {
    medplum
      .graphql(
        `
        {
          Practitioner(id: "${practitionerId}") {
            resourceType
            id
            name {
              given
              family
            }
          }
        }
      `
      )
      .then((value) => setPractitioner(value.data.Practitioner as Practitioner))
      .catch((err) => console.error(err));
  }, [medplum, profile, practitionerId]);

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
        .catch(console.error);
    },
    [medplum, profileRef, practitioner]
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
        setCommunications={(c) => setCommunications(c)}
        sendMessage={sendMessage}
        h={600}
      />
    </Document>
  );
}
