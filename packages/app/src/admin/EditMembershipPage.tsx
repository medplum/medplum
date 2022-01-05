import { AccessPolicy, OperationOutcome, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Loading, MedplumLink, ResourceBadge, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AccessPolicyInput } from './AccessPolicyInput';

export function EditMembershipPage(): JSX.Element {
  const { projectId, membershipId } = useParams();
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<ProjectMembership>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    medplum
      .get(`admin/projects/${projectId}/members/${membershipId}`)
      .then((response) => {
        setResult(response);
        setLoading(false);
      })
      .catch(setOutcome);
  }, [projectId, membershipId]);

  if (loading || !result) {
    return <Loading />;
  }

  return (
    <Document width={600}>
      <h1>Edit membership</h1>
      <h3>
        <ResourceBadge value={result.profile} />
      </h3>
      <Form
        onSubmit={(formData: Record<string, string>) => {
          const accessPolicy = formData.accessPolicy
            ? (JSON.parse(formData.accessPolicy) as Reference<AccessPolicy>)
            : undefined;
          const admin = formData.admin === 'true';
          const updated = {
            ...result,
            accessPolicy,
            admin,
          };

          medplum
            .post(`admin/projects/${projectId}/members/${membershipId}`, updated)
            .then(() => setSuccess(true))
            .catch(setOutcome);
        }}
      >
        {!success && (
          <>
            <FormSection title="Access Policy" htmlFor="accessPolicy" outcome={outcome}>
              <AccessPolicyInput name="accessPolicy" defaultValue={result.accessPolicy} />
            </FormSection>
            <FormSection title="Admin" htmlFor="admin" outcome={outcome}>
              <input type="checkbox" name="admin" defaultChecked={!!result.admin} value="true" />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div></div>
              <div>
                <Button type="submit" testid="submit">
                  Edit
                </Button>
              </div>
            </div>
            <hr />
            <div style={{ textAlign: 'right' }}>
              <Button type="button" testid="remove-user" danger={true}>
                Remove user
              </Button>
            </div>
          </>
        )}
        {success && (
          <div data-testid="success">
            <p>User updated</p>
            <pre>{JSON.stringify(outcome, undefined, 2)}</pre>
            <p>
              Click <MedplumLink to="/admin/project">here</MedplumLink> to return to the project admin page.
            </p>
          </div>
        )}
      </Form>
    </Document>
  );
}
