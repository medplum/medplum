import { OperationOutcome } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Loading, MedplumLink, TextField, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function InvitePage(): JSX.Element {
  const { id } = useParams() as { id: string };
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<any>();
  const [error, setError] = useState();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    medplum
      .get('admin/projects/' + id)
      .then((response) => {
        setResult(response);
        setLoading(false);
      })
      .catch((reason) => setError(reason));
  }, [id]);

  if (error) {
    return (
      <Document>
        <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>
      </Document>
    );
  }

  if (loading || !result) {
    return <Loading />;
  }

  return (
    <Document width={600}>
      <h1>Admin / Projects / {result.project.name}</h1>
      <h3>Invite new member</h3>
      <Form
        onSubmit={(formData: Record<string, string>) => {
          medplum
            .post('admin/projects/' + id + '/invite', formData)
            .then(() => setSuccess(true))
            .catch((err) => {
              if (err.outcome) {
                setOutcome(err.outcome);
              }
            });
        }}
      >
        {!success && (
          <>
            <FormSection title="First Name">
              <TextField
                name="firstName"
                type="text"
                testid="firstName"
                required={true}
                autoFocus={true}
                outcome={outcome}
              />
            </FormSection>
            <FormSection title="Last Name">
              <TextField name="lastName" type="text" testid="lastName" required={true} outcome={outcome} />
            </FormSection>
            <FormSection title="Email">
              <TextField name="email" type="email" testid="email" required={true} outcome={outcome} />
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
