import { Button, Center, Group, PasswordInput, Stack, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, Form, getErrorsForInput, Logo, useMedplum } from '@medplum/react';
import { useState } from 'react';

export function ChangePasswordPage(): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  return (
    <Document width={450}>
      <Form
        onSubmit={(formData: Record<string, string>) => {
          setOutcome(undefined);
          medplum
            .post('auth/changepassword', formData)
            .then(() => setSuccess(true))
            .catch((err) => setOutcome(normalizeOperationOutcome(err)));
        }}
      >
        <Center style={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title>Change password</Title>
        </Center>
        {!success && (
          <Stack gap="xl" mt="xl">
            <PasswordInput
              name="oldPassword"
              label="Old password"
              required={true}
              autoFocus={true}
              error={getErrorsForInput(outcome, 'oldPassword')}
            />
            <PasswordInput
              name="newPassword"
              label="New password"
              required={true}
              error={getErrorsForInput(outcome, 'newPassword')}
            />
            <PasswordInput
              name="confirmPassword"
              label="Confirm new password"
              required={true}
              error={getErrorsForInput(outcome, 'confirmPassword')}
            />
            <Group justify="flex-end" mt="xl" wrap="nowrap">
              <Button type="submit">Change password</Button>
            </Group>
          </Stack>
        )}
        {success && <div data-testid="success">Password changed successfully</div>}
      </Form>
    </Document>
  );
}
