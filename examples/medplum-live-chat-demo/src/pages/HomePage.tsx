import { Button, Group, Title } from '@mantine/core';
import { createReference, getReferenceString } from '@medplum/core';
import { Communication, Practitioner, Reference } from '@medplum/fhirtypes';
import { DrAliceSmith } from '@medplum/mock';
import { Document, Loading, ResourceName, useMedplum, useMedplumProfile } from '@medplum/react';
import { useMemo } from 'react';
import { Chat } from '../Chat';

const DR_ALICE_SMITH: Reference<Practitioner> = {
  reference: getReferenceString(DrAliceSmith),
  display: 'Dr. Alice Smith',
};

/**
 * Home page that greets the user and displays a list of patients.
 * @returns A React component that displays the home page.
 */
export function HomePage(): JSX.Element {
  // useMedplumProfile() returns the "profile resource" associated with the user.
  // This can be a Practitioner, Patient, or RelatedPerson depending on the user's role in the project.
  // See the "Register" tutorial for more detail
  // https://www.medplum.com/docs/tutorials/register
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();

  const profileRef = useMemo(() => createReference(profile), [profile]);

  if (!profile) {
    return <Loading />;
  }

  async function createIncomingMessage(): Promise<void> {
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: DR_ALICE_SMITH,
      recipient: [profileRef],
      payload: [{ contentString: 'Can you come in tomorrow for a follow-up?' }],
      sent: new Date().toISOString(),
    });
  }

  return (
    <Document>
      <Title>
        Welcome <ResourceName value={profile} link />
      </Title>
      <Group position="center" pt="xl">
        <Button onClick={() => createIncomingMessage().catch(console.error)}>Create Incoming Message</Button>
      </Group>
      <Chat />
    </Document>
  );
}
