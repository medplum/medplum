import { AccessPolicy, OperationOutcome, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Loading, MedplumLink, ResourceBadge, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AccessPolicyInput } from './AccessPolicyInput';

export function EditMembershipPage(): JSX.Element {
  const { projectId, membershipId } = useParams();
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [membership, setMembership] = useState<ProjectMembership>();
  const [accessPolicy, setAccessPolicy] = useState<Reference<AccessPolicy>>();
  const [admin, setAdmin] = useState<boolean>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    medplum
      .get(`admin/projects/${projectId}/members/${membershipId}`)
      .then((response) => {
        setMembership(response);
        setAccessPolicy(response.accessPolicy);
        setAdmin(response.admin);
        setLoading(false);
      })
      .catch(setOutcome);
  }, [projectId, membershipId]);

  if (loading || !membership) {
    return <Loading />;
  }

  return (
    <Document width={600}>
      <h1>Edit membership</h1>
      <h3>
        <ResourceBadge value={membership.profile} />
      </h3>
      <Form
        onSubmit={() => {
          const updated: ProjectMembership = {
            ...membership,
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
              <AccessPolicyInput name="accessPolicy" defaultValue={accessPolicy} onChange={setAccessPolicy} />
            </FormSection>
            <FormSection title="Admin" htmlFor="admin" outcome={outcome}>
              <input
                data-testid="admin-checkbox"
                type="checkbox"
                name="admin"
                defaultChecked={admin}
                value="true"
                onChange={(event) => setAdmin(event.currentTarget.value === 'true')}
              />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div></div>
              <div>
                <Button type="submit" testid="submit">
                  Save
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
