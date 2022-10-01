import { Button, TextInput } from '@mantine/core';
import { AccessPolicy, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { Form, FormSection, getErrorsForInput, MedplumLink, useMedplum } from '@medplum/react';
import React, { useState } from 'react';
import { getProjectId } from '../utils';
import { AccessPolicyInput } from './AccessPolicyInput';

export function InvitePage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [accessPolicy, setAccessPolicy] = useState<Reference<AccessPolicy>>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  return (
    <>
      <h1>Invite new member</h1>
      <Form
        onSubmit={() => {
          const body = {
            firstName,
            lastName,
            email,
            accessPolicy,
          };
          medplum
            .post('admin/projects/' + projectId + '/invite', body)
            .then(() => medplum.get(`admin/projects/${projectId}`, { cache: 'reload' }))
            .then(() => setSuccess(true))
            .catch(setOutcome);
        }}
      >
        {!success && (
          <>
            <FormSection title="First Name" htmlFor="firstName" outcome={outcome}>
              <TextInput
                id="firstName"
                name="firstName"
                type="text"
                required={true}
                autoFocus={true}
                onChange={(e) => setFirstName(e.currentTarget.value)}
                error={getErrorsForInput(outcome, 'firstName')}
              />
            </FormSection>
            <FormSection title="Last Name" htmlFor="lastName" outcome={outcome}>
              <TextInput
                id="lastName"
                name="lastName"
                type="text"
                required={true}
                onChange={(e) => setLastName(e.currentTarget.value)}
                error={getErrorsForInput(outcome, 'lastName')}
              />
            </FormSection>
            <FormSection title="Email" htmlFor="email" outcome={outcome}>
              <TextInput
                id="email"
                name="email"
                type="email"
                required={true}
                onChange={(e) => setEmail(e.currentTarget.value)}
                error={getErrorsForInput(outcome, 'email')}
              />
            </FormSection>
            <FormSection title="Access Policy" htmlFor="accessPolicy" outcome={outcome}>
              <AccessPolicyInput name="accessPolicy" onChange={setAccessPolicy} />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div></div>
              <div>
                <Button type="submit">Invite</Button>
              </div>
            </div>
          </>
        )}
        {success && (
          <div data-testid="success">
            <p>User created</p>
            <p>Email sent</p>
            <p>
              Click <MedplumLink to="/admin/project">here</MedplumLink> to return to the project admin page.
            </p>
          </div>
        )}
      </Form>
    </>
  );
}
