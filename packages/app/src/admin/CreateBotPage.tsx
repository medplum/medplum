import { Button, Group, Stack, TextInput, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { AccessPolicy, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { Form, FormSection, getErrorsForInput, MedplumLink, useMedplum } from '@medplum/react';
import React, { useState } from 'react';
import { getProjectId } from '../utils';
import { AccessPolicyInput } from './AccessPolicyInput';

export function CreateBotPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [accessPolicy, setAccessPolicy] = useState<Reference<AccessPolicy>>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

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
            .then(() => medplum.get(`admin/projects/${projectId}`, { cache: 'reload' }))
            .then(() => setSuccess(true))
            .catch((err) => setOutcome(normalizeOperationOutcome(err)));
        }}
      >
        {!success && (
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
            <Group position="right">
              <Button type="submit">Create Bot</Button>
            </Group>
          </Stack>
        )}
        {success && (
          <div data-testid="success">
            <p>Bot created</p>
            <p>
              Click <MedplumLink to="/admin/project">here</MedplumLink> to return to the project admin page.
            </p>
          </div>
        )}
      </Form>
    </>
  );
}
