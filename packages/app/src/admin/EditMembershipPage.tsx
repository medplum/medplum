import { Button, Checkbox, Group, Stack, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { AccessPolicy, OperationOutcome, ProjectMembership, Reference, UserConfiguration } from '@medplum/fhirtypes';
import { Form, FormSection, MedplumLink, ResourceBadge, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getProjectId } from '../utils';
import { AccessPolicyInput } from './AccessPolicyInput';
import { UserConfigurationInput } from './UserConfigurationInput';

export function EditMembershipPage(): JSX.Element {
  const { membershipId } = useParams();
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const navigate = useNavigate();
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
        .then(() => medplum.get(`admin/projects/${projectId}`, { cache: 'no-cache' }))
        .then(() => navigate('/admin/project'))
        .catch((err) => setOutcome(normalizeOperationOutcome(err)));
    }
  }

  return (
    <>
      <Title>Edit membership</Title>
      <h3>
        <ResourceBadge value={membership.profile} link />
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
            .catch((err) => setOutcome(normalizeOperationOutcome(err)));
        }}
      >
        {!success && (
          <Stack>
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
              <Checkbox
                id="admin"
                name="admin"
                defaultChecked={admin}
                onChange={(e) => setAdmin(e.currentTarget.checked)}
              />
            </FormSection>
            <Group justify="flex-end" mt="xl">
              <Button type="submit">Save</Button>
              <Button type="button" color="red" variant="outline" onClick={deleteMembership}>
                Remove user
              </Button>
            </Group>
          </Stack>
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
    </>
  );
}
