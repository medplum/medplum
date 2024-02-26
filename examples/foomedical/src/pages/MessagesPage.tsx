import { Button, Divider, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { createReference, formatDateTime, getReferenceString } from '@medplum/core';
import { Communication, Patient, Practitioner } from '@medplum/fhirtypes';
import { Document, Form, ResourceAvatar, ResourceName, useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { Loading } from '../components/Loading';

export function Messages(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Patient;
  const [messages, setMessages] = useState<Communication[]>();

  useEffect(() => {
    medplum
      .graphql(
        `
        {
          CommunicationList(subject: "${getReferenceString(profile)}") {
            resourceType
            id
            meta {
              lastUpdated
            }
            payload {
              contentString
              contentAttachment {
                url
                contentType
              }
            }
            sender {
              reference
              resource {
                ... on Patient {
                  resourceType
                  id
                  name {
                    given
                    family
                  }
                  photo {
                    contentType
                    url
                  }
                }
                ... on Practitioner {
                  resourceType
                  id
                  name {
                    given
                    family
                  }
                  photo {
                    contentType
                    url
                  }
                }
              }
            }
          }
      }
        `
      )
      .then((value) => setMessages(value.data.CommunicationList as Communication[]))
      .catch((err) => console.error(err));
  }, [medplum, profile]);

  if (!messages) {
    return <Loading />;
  }

  return (
    <Document width={800}>
      <Title>Messages</Title>
      <Divider my="xl" />
      <Stack gap="xl">
        {messages.map((resource) => (
          <div key={resource.id}>
            <Group align="top">
              <ResourceAvatar size="lg" radius="xl" value={resource.sender?.resource as Practitioner} />
              <div>
                <Text size="sm" fw={500}>
                  <ResourceName value={resource.sender?.resource as Patient | Practitioner} />
                </Text>
                <Text size="xs" color="dimmed">
                  {formatDateTime(resource?.meta?.lastUpdated)}
                </Text>
                <Text size="md" my="sm">
                  {resource.payload?.[0].contentString}
                </Text>
              </div>
            </Group>
          </div>
        ))}
        <div style={{ margin: '0 -20px -20px -20px', padding: 20, background: '#f8f8f8' }}>
          <Form
            onSubmit={(formData: Record<string, string>) => {
              medplum
                .createResource({
                  resourceType: 'Communication',
                  status: 'completed',
                  subject: createReference(profile),
                  sender: createReference(profile),
                  payload: [{ contentString: formData.contentString }],
                })
                .then((result) => setMessages([...messages, result]))
                .catch(console.log);
            }}
          >
            <Group align="top">
              <ResourceAvatar size="lg" radius="xl" value={profile} />
              <Textarea name="contentString" style={{ flex: 1 }} placeholder="Add note" autosize />
            </Group>
            <Group justify="flex-end" mt="md">
              <Button type="submit">Send</Button>
            </Group>
          </Form>
        </div>
      </Stack>
    </Document>
  );
}
