import { ActionIcon, Button, Stack, TextInput, Title } from '@mantine/core';
import { createReference, getReferenceString } from '@medplum/core';
import { Communication, Patient, Practitioner } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import {
  ChatModal,
  Document,
  Form,
  Loading,
  ResourceName,
  ThreadChat,
  useMedplum,
  useMedplumProfile,
} from '@medplum/react';
import { IconArrowRight } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Home page that greets the user and displays a list of patients.
 * @returns A React component that displays the home page.
 */
export function HomePage(): JSX.Element {
  // useMedplumProfile() returns the "profile resource" associated with the user.
  // This can be a Practitioner, Patient, or RelatedPerson depending on the user's role in the project.
  // See the "Register" tutorial for more detail
  // https://www.medplum.com/docs/tutorials/register
  // This page is not rendered unless profile is defined, so we can assert Practitioner
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();
  const [thread, setThread] = useState<Communication>();
  const [homerSimpson, setHomerSimpson] = useState<Patient>();
  const searchingThreadRef = useRef(false);

  useEffect(() => {
    medplum
      .createResourceIfNoneExist(HomerSimpson, "name='Homer Simpson'")
      .then((homer) => {
        setHomerSimpson(homer);
      })
      .catch(console.error);
  }, [medplum]);

  useEffect(() => {
    if (!homerSimpson || searchingThreadRef.current) {
      return;
    }
    searchingThreadRef.current = true;
    const meReference = createReference(profile);
    medplum
      .createResourceIfNoneExist<Communication>(
        {
          resourceType: 'Communication',
          topic: { text: 'Demo Thread' },
          sender: meReference,
          recipient: [meReference, createReference(homerSimpson)],
          status: 'in-progress',
        },
        `part-of:missing=true&recipient=${getReferenceString(profile)}&recipient=${getReferenceString(homerSimpson)}&topic:text='Demo Thread'`
      )
      .then((thread) => {
        setThread(thread);
        searchingThreadRef.current = false;
      })
      .catch(console.error);
  }, [medplum, profile, homerSimpson]);

  const incomingInputRef = useRef<HTMLInputElement>(null);

  if (!(thread && homerSimpson)) {
    return <Loading />;
  }

  async function createIncomingMessage(message: string): Promise<void> {
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: createReference(homerSimpson as Patient),
      recipient: [createReference(profile)],
      payload: [{ contentString: message }],
      sent: new Date().toISOString(),
      partOf: [createReference(thread as Communication)],
    });
  }

  async function markLastMessageAsDelivered(): Promise<void> {
    const lastMessage = await medplum.searchOne(
      'Communication',
      `part-of=${getReferenceString(thread as Communication)}&sender=${getReferenceString(profile)}&_sort=-sent`
    );

    if (lastMessage && !lastMessage.received) {
      await medplum.updateResource({
        ...lastMessage,
        received: new Date().toISOString(),
        status: 'completed',
      });
    }
  }

  return (
    <Document>
      <Title>
        Welcome <ResourceName value={profile} link />
      </Title>
      <Stack>
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
        <Button onClick={() => markLastMessageAsDelivered().catch(console.error)}>Mark Last Message Delivered</Button>
      </Stack>
      {thread && (
        <ChatModal>
          <ThreadChat thread={thread} />
        </ChatModal>
      )}
    </Document>
  );
}
