import { AccessPolicy, OperationOutcome, ProjectMembership, Reference, UserConfiguration } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, MedplumLink, ResourceBadge, useMedplum } from '@medplum/react';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AccessPolicyInput } from './AccessPolicyInput';
import { UserConfigurationInput } from './UserConfigurationInput';

export function EditMembershipPage(): JSX.Element {
  const { projectId, membershipId } = useParams();
  const medplum = useMedplum();
  const membership = medplum.get(`admin/projects/${projectId}/members/${membershipId}`).read();
  const [accessPolicy, setAccessPolicy] = useState<Reference<AccessPolicy> | undefined>(membership.accessPolicy);
  const [userConfiguration, setUserConfiguration] = useState<Reference<UserConfiguration> | undefined>(
    membership.userConfiguration
  );
  const [admin, setAdmin] = useState<boolean>(membership.admin);
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  function deleteMembership(): void {
    if (window.confirm('Are you sure?')) {
      medplum
        .delete(`admin/projects/${projectId}/members/${membershipId}`)
        .then(() => setSuccess(true))
        .catch(setOutcome);
    }
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
            userConfiguration,
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
            <FormSection title="User Configuration" htmlFor="userConfiguration" outcome={outcome}>
              <UserConfigurationInput
                name="userConfiguration"
                defaultValue={userConfiguration}
                onChange={setUserConfiguration}
              />
            </FormSection>
            <FormSection title="Admin" htmlFor="admin" outcome={outcome}>
              <input
                data-testid="admin-checkbox"
                type="checkbox"
                name="admin"
                defaultChecked={admin}
                value="true"
                onChange={(event) => setAdmin(event.currentTarget.checked)}
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
              <Button type="button" testid="remove-user" danger={true} onClick={deleteMembership}>
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
