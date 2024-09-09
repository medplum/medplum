import { Button, Group, List, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { AccessPolicy, ClientApplication, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { Form, FormSection, getErrorsForInput, MedplumLink, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { getProjectId } from '../utils';
import { AccessPolicyInput } from './AccessPolicyInput';

export function CreateClientPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [redirectUri, setRedirectUri] = useState<string>('');
  const [accessPolicy, setAccessPolicy] = useState<Reference<AccessPolicy>>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [client, setClient] = useState<ClientApplication | undefined>(undefined);

  return (
    <>
      <Title>Create new Client</Title>
      <Form
        onSubmit={() => {
          const body = {
            name,
            description,
            redirectUri,
            accessPolicy,
          };
          medplum
            .post('admin/projects/' + projectId + '/client', body)
            .then((result: ClientApplication) => {
              medplum.invalidateSearches('ClientApplication');
              medplum.invalidateSearches('ProjectMembership');
              setClient(result);
              showNotification({ color: 'green', message: 'Client created' });
            })
            .catch((err) => {
              showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
              setOutcome(normalizeOperationOutcome(err));
            });
        }}
      >
        {!client && (
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
            <FormSection title="Redirect URI" htmlFor="redirectUri" outcome={outcome}>
              <TextInput
                id="redirectUri"
                name="redirectUri"
                onChange={(e) => setRedirectUri(e.currentTarget.value)}
                error={getErrorsForInput(outcome, 'redirectUri')}
              />
            </FormSection>
            <FormSection title="Access Policy" htmlFor="accessPolicy" outcome={outcome}>
              <AccessPolicyInput name="accessPolicy" onChange={setAccessPolicy} />
            </FormSection>
            <Group justify="flex-end">
              <Button type="submit">Create Client</Button>
            </Group>
          </Stack>
        )}
        {client && (
          <div data-testid="success">
            <Text>Client created</Text>
            <List>
              <List.Item>
                <MedplumLink to={client}>Go to new client</MedplumLink>
              </List.Item>
              <List.Item>
                <MedplumLink to="/admin/clients">Back to clients list</MedplumLink>
              </List.Item>
            </List>
          </div>
        )}
      </Form>
    </>
  );
}
