import { AccessPolicy, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Loading, MedplumLink, Input, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AccessPolicyInput } from './AccessPolicyInput';

export function InvitePage(): JSX.Element {
  const { projectId } = useParams() as { projectId: string };
  const medplum = useMedplum();
  const [result, setResult] = useState<any>();
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [accessPolicy, setAccessPolicy] = useState<Reference<AccessPolicy>>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    medplum
      .get('admin/projects/' + projectId)
      .then((response) => {
        setResult(response);
      })
      .catch(setOutcome);
  }, [medplum, projectId]);

  if (!result) {
    return <Loading />;
  }

  return (
    <Document width={600}>
      <h1>Admin / Projects / {result.project.name}</h1>
      <h3>Invite new member</h3>
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
            .then(() => setSuccess(true))
            .catch(setOutcome);
        }}
      >
        {!success && (
          <>
            <FormSection title="First Name" htmlFor="firstName" outcome={outcome}>
              <Input
                name="firstName"
                type="text"
                testid="firstName"
                required={true}
                autoFocus={true}
                onChange={setFirstName}
                outcome={outcome}
              />
            </FormSection>
            <FormSection title="Last Name" htmlFor="lastName" outcome={outcome}>
              <Input
                name="lastName"
                type="text"
                testid="lastName"
                required={true}
                onChange={setLastName}
                outcome={outcome}
              />
            </FormSection>
            <FormSection title="Email" htmlFor="email" outcome={outcome}>
              <Input name="email" type="email" testid="email" required={true} onChange={setEmail} outcome={outcome} />
            </FormSection>
            <FormSection title="Access Policy" htmlFor="accessPolicy" outcome={outcome}>
              <AccessPolicyInput name="accessPolicy" onChange={setAccessPolicy} />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div></div>
              <div>
                <Button type="submit" testid="submit">
                  Invite
                </Button>
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
    </Document>
  );
}
