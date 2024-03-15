import { ActionIcon, TextInput, Title } from '@mantine/core';
import { ProfileResource, createReference, getReferenceString } from '@medplum/core';
import { Communication, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { Document, Form, Loading, ResourceName, ThreadChat, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconArrowRight } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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

  const incomingInputRef = useRef<HTMLInputElement>(null);

  if (!(profile && threadRef)) {
    return <Loading />;
  }

  async function createIncomingMessage(message: string): Promise<void> {
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: HOMER_SIMPSON,
      recipient: [profileRef],
      payload: [{ contentString: message }],
      sent: new Date().toISOString(),
      partOf: [threadRef as Reference<Communication>],
    });
  }

  return (
    <Document>
      <Title>
        Welcome <ResourceName value={profile} link />
      </Title>
      <Form
        onSubmit={(formData) => {
          if (incomingInputRef.current) {
            incomingInputRef.current.value = '';
          }
          createIncomingMessage(formData.message).catch(console.error);
        }}
      >
        <TextInput
          ref={incomingInputRef}
          name="message"
          placeholder="Create an incoming chat message"
          radius="xl"
          rightSectionWidth={42}
          rightSection={
            <ActionIcon
              type="submit"
              size="1.5rem"
              radius="xl"
              color="blue"
              variant="filled"
              aria-label="Create incoming message"
            >
              <IconArrowRight size="1rem" stroke={1.5} />
            </ActionIcon>
          }
          pt={20}
        />
      </Form>

      {thread && <ThreadChat title={`Chat with ${HOMER_SIMPSON.display}`} thread={thread} />}
    </Document>
  );
}
