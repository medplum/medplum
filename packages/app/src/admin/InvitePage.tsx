import { Button, Checkbox, Group, List, NativeSelect, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  isOperationOutcome,
  normalizeErrorString,
  normalizeOperationOutcome,
  InviteResult,
  InviteBody,
} from '@medplum/core';
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
  const [result, setResult] = useState<InviteResult | undefined>(undefined);

  return (
    <Form
      onSubmit={(formData: Record<string, string>) => {
        const body = {
          resourceType: formData.resourceType as 'Practitioner' | 'Patient' | 'RelatedPerson',
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          sendEmail: formData.sendEmail === 'on',
          accessPolicy,
          admin: formData.isAdmin === 'on',
        };
        medplum
          .invite(projectId, body as InviteBody)
          .then((response: InviteResult | OperationOutcome) => {
            medplum.invalidateSearches('Patient');
            medplum.invalidateSearches('Practitioner');
            medplum.invalidateSearches('ProjectMembership');
            if (isOperationOutcome(response)) {
              setOutcome(response);
            } else {
              setResult(response);
            }
            setEmailSent(body.sendEmail ?? false);
            showNotification({ color: 'green', message: 'Invite success' });
          })
          .catch((err) => {
            showNotification({ color: 'red', message: normalizeErrorString(err) });
            setOutcome(normalizeOperationOutcome(err));
          });
      }}
    >
      {!result && !outcome && (
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
          <Checkbox name="isAdmin" label="Admin" />
          <Group position="right">
            <Button type="submit">Invite</Button>
          </Group>
        </Stack>
      )}
      {outcome && (
        <div data-testid="success">
          <p>User created, email couldn't be sent</p>
          <p>Could not send email. Make sure you have AWS SES set up.</p>
          <p>
            Click <MedplumLink to="/admin/project">here</MedplumLink> to return to the project admin page.
          </p>
        </div>
      )}
      {result && (
        <div data-testid="success">
          <Text>User created</Text>
          {emailSent && <Text>Email sent</Text>}
          <List>
            <List.Item>
              <MedplumLink to={result.membership}>Go to new membership</MedplumLink>
            </List.Item>
            <List.Item>
              <MedplumLink to={result.profile}>Go to new profile</MedplumLink>
            </List.Item>
            <List.Item>
              <MedplumLink to="/admin/users">Back to users list</MedplumLink>
            </List.Item>
          </List>
        </div>
      )}
    </Form>
  );
}
