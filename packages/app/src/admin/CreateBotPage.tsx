import { Button, Group, List, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { AccessPolicy, Bot, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { Form, FormSection, getErrorsForInput, MedplumLink, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { getProjectId } from '../utils';
import { AccessPolicyInput } from './AccessPolicyInput';

export function CreateBotPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [accessPolicy, setAccessPolicy] = useState<Reference<AccessPolicy>>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [bot, setBot] = useState<Bot | undefined>(undefined);

  return (
    <>
      <Title>Create new Bot</Title>
      <Form
        onSubmit={() => {
          const body = {
            name,
            description,
            accessPolicy,
          };
          medplum
            .post('admin/projects/' + projectId + '/bot', body)
            .then((result: Bot) => {
              medplum.invalidateSearches('Bot');
              medplum.invalidateSearches('ProjectMembership');
              setBot(result);
              showNotification({ color: 'green', message: 'Bot created' });
            })
            .catch((err) => {
              showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
              setOutcome(normalizeOperationOutcome(err));
            });
        }}
      >
        {!bot && (
          <Stack>
            <FormSection title="Name" htmlFor="name" outcome={outcome}>
              <TextInput
                id="name"
                name="name"
                required={true}
                autoFocus={true}
                onChange={(e) => setName(e.currentTarget.value)}
                error={getErrorsForInput(outcome, 'name')}
              />
            </FormSection>
            <FormSection title="Description" htmlFor="description" outcome={outcome}>
              <TextInput
                id="description"
                name="description"
                onChange={(e) => setDescription(e.currentTarget.value)}
                error={getErrorsForInput(outcome, 'description')}
              />
            </FormSection>
            <FormSection title="Access Policy" htmlFor="accessPolicy" outcome={outcome}>
              <AccessPolicyInput name="accessPolicy" onChange={setAccessPolicy} />
            </FormSection>
            <Group justify="flex-end">
              <Button type="submit">Create Bot</Button>
            </Group>
          </Stack>
        )}
        {bot && (
          <div data-testid="success">
            <Text>Bot created</Text>
            <List>
              <List.Item>
                <MedplumLink to={bot}>Go to new bot</MedplumLink>
              </List.Item>
              <List.Item>
                <MedplumLink to="/admin/bots">Back to bots list</MedplumLink>
              </List.Item>
            </List>
          </div>
        )}
      </Form>
    </>
  );
}
