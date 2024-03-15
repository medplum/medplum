import { Button, Group, Title } from '@mantine/core';
import { ProfileResource, createReference, getReferenceString } from '@medplum/core';
import { Communication, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { Document, Loading, ResourceName, ThreadChat, useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';

const HOMER_SIMPSON: Reference<Patient> = {
  reference: getReferenceString(HomerSimpson),
  display: 'Homer Simpson',
};
const HOMER_SIMPSON_REF_STR = getReferenceString(HOMER_SIMPSON);

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
  const [thread, setThread] = useState<Communication>();

  const profileRef = useMemo(() => createReference(profile as ProfileResource), [profile]);
  const profileRefStr = useMemo(() => getReferenceString(profile), [profile]);
  const threadRef = useMemo(() => (thread ? createReference(thread) : undefined), [thread]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    medplum
      .searchOne(
        'Communication',
        `part-of:missing=true&recipient=${profileRefStr},${HOMER_SIMPSON_REF_STR}&topic:text='Demo Thread'`
      )
      .then((thread) => {
        if (!thread) {
          medplum
            .createResource<Communication>({
              resourceType: 'Communication',
              topic: { text: 'Demo Thread' },
              recipient: [profileRef, HOMER_SIMPSON],
              status: 'in-progress',
            })
            .then((thread) => {
              setThread(thread);
            })
            .catch(console.error);
        } else {
          setThread(thread);
        }
      })
      .catch(console.error);
  }, [medplum, profile, profileRef, profileRefStr]);

  if (!(profile && threadRef)) {
    return <Loading />;
  }

  async function createIncomingMessage(): Promise<void> {
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: HOMER_SIMPSON,
      recipient: [profileRef],
      payload: [{ contentString: "Hey doc, I just ate a dozen donuts and can't feel my legs! HELP" }],
      sent: new Date().toISOString(),
      partOf: [threadRef as Reference<Communication>],
    });
  }

  return (
    <Document>
      <Title>
        Welcome <ResourceName value={profile} link />
      </Title>
      <Group justify="center" pt="xl">
        <Button onClick={() => createIncomingMessage().catch(console.error)}>Create Incoming Message</Button>
      </Group>
      {thread && <ThreadChat title={`Chat with ${HOMER_SIMPSON.display}`} thread={thread} />}
    </Document>
  );
}
