import { Button, Checkbox, Group, List, NativeSelect, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { InviteRequest, isOperationOutcome, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { AccessPolicy, OperationOutcome, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Form, FormSection, MedplumLink, ResourceInput, getErrorsForInput, useMedplum } from '@medplum/react';
import { useCallback, useState } from 'react';
import { AccessPolicyInput } from './AccessPolicyInput';

export function InvitePage(): JSX.Element {
  const medplum = useMedplum();
  const [project, setProject] = useState<Project | undefined>(medplum.getProject());
  const [accessPolicy, setAccessPolicy] = useState<Reference<AccessPolicy>>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [emailSent, setEmailSent] = useState(false);
  const [result, setResult] = useState<ProjectMembership | undefined>(undefined);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
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
        .invite(project?.id as string, body as InviteRequest)
        .then((response: ProjectMembership | OperationOutcome) => {
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
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
          setOutcome(normalizeOperationOutcome(err));
        });
    },
    [medplum, project, accessPolicy]
  );

  return (
    <Form onSubmit={handleSubmit}>
      {!result && !outcome && (
        <Stack>
          <Title>Invite new member</Title>
          {medplum.isSuperAdmin() && (
            <FormSection title="Project" htmlFor="project" outcome={outcome}>
              <ResourceInput<Project>
                resourceType="Project"
                name="project"
                defaultValue={project}
                onChange={setProject}
              />
            </FormSection>
          )}
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
          <Group justify="flex-end">
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
              <MedplumLink to={result as ProjectMembership}>Go to new membership</MedplumLink>
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
