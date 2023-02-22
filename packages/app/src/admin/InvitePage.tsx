import { Button, Checkbox, Group, NativeSelect, Stack, TextInput, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { AccessPolicy, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { Form, FormSection, getErrorsForInput, MedplumLink, useMedplum } from '@medplum/react';
import React, { useState } from 'react';
import { getProjectId } from '../utils';
import { AccessPolicyInput } from './AccessPolicyInput';

export function InvitePage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const [accessPolicy, setAccessPolicy] = useState<Reference<AccessPolicy>>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [emailSent, setEmailSent] = useState(false);
  const [success, setSuccess] = useState(false);

  return (
    <Form
      onSubmit={(formData: Record<string, string>) => {
        const body = {
          resourceType: formData.resourceType,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          sendEmail: formData.sendEmail === 'on',
          accessPolicy,
        };
        medplum
          .post('admin/projects/' + projectId + '/invite', body)
          .then(() => medplum.get(`admin/projects/${projectId}`, { cache: 'reload' }))
          .then(() => setEmailSent(body.sendEmail))
          .then(() => setSuccess(true))
          .catch((err) => setOutcome(normalizeOperationOutcome(err)));
      }}
    >
      {!success && (
        <Stack>
          <Title>Invite new member</Title>
          <NativeSelect
            name="resourceType"
            label="Role"
            defaultValue="Practitioner"
            data={['Practitioner', 'Patient', 'RelatedPerson']}
            error={getErrorsForInput(outcome, 'resourceType')}
          />
          <TextInput
            name="firstName"
            label="First Name"
            required={true}
            autoFocus={true}
            error={getErrorsForInput(outcome, 'firstName')}
          />
          <TextInput name="lastName" label="Last Name" required={true} error={getErrorsForInput(outcome, 'lastName')} />
          <TextInput
            name="email"
            type="email"
            label="Email"
            required={true}
            error={getErrorsForInput(outcome, 'email')}
          />
          <FormSection title="Access Policy" htmlFor="accessPolicy" outcome={outcome}>
            <AccessPolicyInput name="accessPolicy" onChange={setAccessPolicy} />
          </FormSection>
          <Checkbox name="sendEmail" label="Send email" defaultChecked={true} />
          <Group position="right">
            <Button type="submit">Invite</Button>
          </Group>
        </Stack>
      )}
      {success && (
        <div data-testid="success">
          <p>User created</p>
          {emailSent && <p>Email sent</p>}
          <p>
            Click <MedplumLink to="/admin/project">here</MedplumLink> to return to the project admin page.
          </p>
        </div>
      )}
    </Form>
  );
}
