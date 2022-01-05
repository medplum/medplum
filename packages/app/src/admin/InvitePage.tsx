import { AccessPolicy, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Loading, MedplumLink, TextField, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AccessPolicyInput } from './AccessPolicyInput';

export function InvitePage(): JSX.Element {
  const { id } = useParams() as { id: string };
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<any>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    medplum
      .get('admin/projects/' + id)
      .then((response) => {
        setResult(response);
        setLoading(false);
      })
      .catch(setOutcome);
  }, [id]);

  if (loading || !result) {
    return <Loading />;
  }

  return (
    <Document width={600}>
      <h1>Admin / Projects / {result.project.name}</h1>
      <h3>Invite new member</h3>
      <Form
        onSubmit={(formData: Record<string, string>) => {
          const accessPolicy = formData.accessPolicy
            ? (JSON.parse(formData.accessPolicy) as Reference<AccessPolicy>)
            : undefined;
          const body = {
            ...formData,
            accessPolicy,
          };
          medplum
            .post('admin/projects/' + id + '/invite', body)
            .then(() => setSuccess(true))
            .catch(setOutcome);
        }}
      >
        {!success && (
          <>
            <FormSection title="First Name" htmlFor="firstName" outcome={outcome}>
              <TextField
                name="firstName"
                type="text"
                testid="firstName"
                required={true}
                autoFocus={true}
                outcome={outcome}
              />
            </FormSection>
            <FormSection title="Last Name" htmlFor="lastName" outcome={outcome}>
              <TextField name="lastName" type="text" testid="lastName" required={true} outcome={outcome} />
            </FormSection>
            <FormSection title="Email" htmlFor="email" outcome={outcome}>
              <TextField name="email" type="email" testid="email" required={true} outcome={outcome} />
            </FormSection>
            <FormSection title="Access Policy" htmlFor="accessPolicy" outcome={outcome}>
              <AccessPolicyInput name="accessPolicy" />
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
