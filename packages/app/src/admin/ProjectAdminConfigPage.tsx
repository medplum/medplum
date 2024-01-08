import { Button, Divider, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { forbidden, normalizeErrorString } from '@medplum/core';
import { Document, Form, OperationOutcomeAlert, useMedplum } from '@medplum/react';

export function ProjectAdminConfigPage(): JSX.Element {
  const medplum = useMedplum();

  if (!medplum.isLoading() && !medplum.isProjectAdmin()) {
    return <OperationOutcomeAlert outcome={forbidden} />;
  }

  function forceSetPassword(formData: Record<string, string>): void {
    medplum
      .post('admin/projects/setpassword', formData)
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  return (
    <Document width={600}>
      <Title order={1}>Project Admin</Title>
      <Divider my="lg" />
      <Title order={2}>Force Set Password</Title>
      <p>
        Note that this applies only to users scoped to this project. This will not work for users who are members of
        multiple projects. Always prefer to use the "Forgot Password" flow first.
      </p>
      <Form onSubmit={forceSetPassword}>
        <Stack>
          <TextInput name="email" label="Email" required />
          <PasswordInput name="password" label="Password" required />
          <Button type="submit">Force Set Password</Button>
        </Stack>
      </Form>
    </Document>
  );
}
