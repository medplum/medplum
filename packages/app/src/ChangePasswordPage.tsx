import { Button, Group, PasswordInput, Stack, Text } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, Form, getErrorsForInput, Logo, useMedplum } from '@medplum/react';
import React, { useState } from 'react';

export function ChangePasswordPage(): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  return (
    <Document width={450}>
      <Form
        style={{ maxWidth: 400 }}
        onSubmit={(formData: Record<string, string>) => {
          setOutcome(undefined);
          medplum
            .post('auth/changepassword', formData)
            .then(() => setSuccess(true))
            .catch(setOutcome);
        }}
      >
        <div className="medplum-center">
          <Logo size={32} />
          <Text size="lg" weight={500}>
            Change password
          </Text>
        </div>
        {!success && (
          <Stack spacing="xl" mt="xl">
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
            <Group position="right" mt="xl" noWrap>
              <Button type="submit">Change password</Button>
            </Group>
          </Stack>
        )}
        {success && <div data-testid="success">Password changed successfully</div>}
      </Form>
    </Document>
  );
}
