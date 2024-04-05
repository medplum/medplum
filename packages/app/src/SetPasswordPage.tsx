import { Button, Center, Group, PasswordInput, Stack, Title } from '@mantine/core';
import { badRequest, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import {
  Document,
  Form,
  Logo,
  MedplumLink,
  OperationOutcomeAlert,
  getErrorsForInput,
  getIssuesForExpression,
  useMedplum,
} from '@medplum/react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

export function SetPasswordPage(): JSX.Element {
  const { id, secret } = useParams() as { id: string; secret: string };
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);
  const issues = getIssuesForExpression(outcome, undefined);

  return (
    <Document width={450}>
      <OperationOutcomeAlert issues={issues} />
      <Form
        onSubmit={(formData: Record<string, string>) => {
          if (formData.password !== formData.confirmPassword) {
            setOutcome(badRequest('Passwords do not match', 'confirmPassword'));
            return;
          }
          setOutcome(undefined);
          const body = {
            id,
            secret,
            password: formData.password,
          };
          medplum
            .post('auth/setpassword', body)
            .then(() => setSuccess(true))
            .catch((err) => setOutcome(normalizeOperationOutcome(err)));
        }}
      >
        <Center style={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title>Set password</Title>
        </Center>
        {!success && (
          <Stack>
            <PasswordInput
              name="password"
              label="New password"
              required={true}
              error={getErrorsForInput(outcome, 'password')}
            />
            <PasswordInput
              name="confirmPassword"
              label="Confirm new password"
              required={true}
              error={getErrorsForInput(outcome, 'confirmPassword')}
            />
            <Group justify="flex-end" mt="xl">
              <Button type="submit">Set password</Button>
            </Group>
          </Stack>
        )}
        {success && (
          <div data-testid="success">
            Password set. You can now&nbsp;<MedplumLink to="/signin">sign in</MedplumLink>.
          </div>
        )}
      </Form>
    </Document>
  );
}
