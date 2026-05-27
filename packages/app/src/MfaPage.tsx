// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Group, List, Modal, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { MfaFormFields } from '@medplum/react';
import { Document, MfaForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

type MfaMethod = 'totp' | 'email';

const METHOD_LABELS: Record<MfaMethod, string> = {
  totp: 'Authenticator app',
  email: 'Email',
};

export function MfaPage(): JSX.Element | null {
  const medplum = useMedplum();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>();
  const [enrolled, setEnrolled] = useState<boolean | undefined>(undefined);
  const [enrolledMethods, setEnrolledMethods] = useState<MfaMethod[]>([]);
  const [allowedMethods, setAllowedMethods] = useState<MfaMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod>();
  const [addingTotp, setAddingTotp] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [removingMethod, setRemovingMethod] = useState<MfaMethod>();

  const fetchStatus = useCallback(() => {
    medplum
      .get('auth/mfa/status', { cache: 'no-cache' })
      .then((response) => {
        setQrCodeUrl(response.enrollQrCode);
        setEnrolled(response.enrolled);
        setEnrolledMethods(response.enrolledMethods ?? []);
        setAllowedMethods(response.allowedMethods ?? ['totp']);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const markEnrolled = useCallback((method: MfaMethod) => {
    setEnrolled(true);
    setEnrolledMethods((prev) => (prev.includes(method) ? prev : [...prev, method]));
    setSelectedMethod(undefined);
  }, []);

  const enrollTotp = useCallback(
    (formData: Record<MfaFormFields, string>) => {
      medplum
        .post('auth/mfa/enroll', { method: 'totp', token: formData.token })
        .then(() => {
          setAddingTotp(false);
          markEnrolled('totp');
          showNotification({ color: 'green', message: 'Authenticator app enabled' });
        })
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
    },
    [medplum, markEnrolled]
  );

  const enrollEmail = useCallback(() => {
    medplum
      .post('auth/mfa/enroll', { method: 'email' })
      .then(() => {
        markEnrolled('email');
        showNotification({ color: 'green', message: 'Email-based MFA enabled' });
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, markEnrolled]);

  const disableMfa = useCallback(
    async (formData: Record<MfaFormFields, string>): Promise<OperationOutcome> => {
      return medplum.post('auth/mfa/disable', { token: formData.token });
    },
    [medplum]
  );

  const removeMethod = useCallback(
    async (method: MfaMethod, formData: Record<MfaFormFields, string>): Promise<void> => {
      // This will throw if the factor failed to be removed
      await medplum.post('auth/mfa/disable', { method, token: formData.token });
      setRemovingMethod(undefined);
      showNotification({ color: 'green', message: `${METHOD_LABELS[method]} removed` });
      // Refresh the status so the remaining methods (and TOTP QR code) are up to date
      fetchStatus();
    },
    [medplum, fetchStatus]
  );

  if (enrolled === undefined) {
    return null;
  }

  const emailAllowed = allowedMethods.includes('email');
  const totpAllowed = allowedMethods.includes('totp');
  const emailEnrolled = enrolledMethods.includes('email');
  const totpEnrolled = enrolledMethods.includes('totp');

  if (enrolled) {
    const canAddEmail = emailAllowed && !emailEnrolled;
    const canAddTotp = totpAllowed && !totpEnrolled;
    // Removing an individual factor only makes sense when more than one is
    // enrolled; removing the last one is handled by "Disable MFA" below.
    const canRemoveMethods = enrolledMethods.length > 1;
    return (
      <Document width={400}>
        <Modal title="Disable MFA" opened={disabling} onClose={() => setDisabling(false)}>
          <MfaForm
            title="Disable MFA"
            buttonText="Submit code"
            onSubmit={async (formData) => {
              // This will throw if MFA failed to disable
              await disableMfa(formData);
              setDisabling(false);
              setEnrolled(false);
              setEnrolledMethods([]);
              setSelectedMethod(undefined);
              setAddingTotp(false);
              showNotification({
                id: 'mfa-disabled',
                color: 'green',
                title: 'Success',
                message: 'MFA disabled',
                icon: <IconCircleCheck />,
              });
              // We fetch the status so that the MFA QR code is refreshed
              fetchStatus();
            }}
          />
        </Modal>
        <Modal
          title={removingMethod ? `Remove ${METHOD_LABELS[removingMethod]}` : undefined}
          opened={Boolean(removingMethod)}
          onClose={() => setRemovingMethod(undefined)}
        >
          {removingMethod && (
            <MfaForm
              title={`Remove ${METHOD_LABELS[removingMethod]}`}
              description="Enter the code from your authenticator app to confirm."
              buttonText="Submit code"
              onSubmit={(formData) => removeMethod(removingMethod, formData)}
            />
          )}
        </Modal>
        <Stack>
          <Title order={3}>Multi-factor authentication</Title>
          <Text c="dimmed">Enabled methods:</Text>
          <List>
            {enrolledMethods.map((method) => (
              <List.Item key={method}>
                <Group justify="space-between" wrap="nowrap">
                  <Text>{METHOD_LABELS[method]}</Text>
                  {canRemoveMethods && (
                    <Anchor href="#" c="red" onClick={() => setRemovingMethod(method)}>
                      Remove
                    </Anchor>
                  )}
                </Group>
              </List.Item>
            ))}
          </List>

          {(canAddEmail || canAddTotp) && (
            <Stack>
              <Title order={5}>Add another method</Title>
              {canAddEmail && (
                <Button variant="default" onClick={enrollEmail}>
                  Add email-based MFA
                </Button>
              )}
              {canAddTotp && !addingTotp && (
                <Button variant="default" onClick={() => setAddingTotp(true)}>
                  Add an authenticator app
                </Button>
              )}
              {canAddTotp && addingTotp && (
                <MfaForm
                  title="Add an authenticator app"
                  description="Scan this QR code with your authenticator app, then enter the code it generates."
                  buttonText="Enroll"
                  qrCodeUrl={qrCodeUrl}
                  onSubmit={enrollTotp}
                />
              )}
            </Stack>
          )}

          <Group>
            <Button color="red" variant="outline" onClick={() => setDisabling(true)}>
              Disable MFA
            </Button>
          </Group>
        </Stack>
      </Document>
    );
  }

  // When more than one method is available, let the user choose first.
  if (emailAllowed && totpAllowed && !selectedMethod) {
    return (
      <Document width={400}>
        <Stack>
          <Title order={3}>Set up multi-factor authentication</Title>
          <Text c="dimmed">Choose how you want to verify your identity when you sign in.</Text>
          <Button onClick={() => setSelectedMethod('totp')}>Use an authenticator app (recommended)</Button>
          <Button variant="default" onClick={enrollEmail}>
            Continue with email-based MFA
          </Button>
        </Stack>
      </Document>
    );
  }

  // Email-only project setting.
  if (emailAllowed && !totpAllowed) {
    return (
      <Document width={400}>
        <Stack>
          <Title order={3}>Set up email-based MFA</Title>
          <Text c="dimmed">When you sign in, we'll email you a verification code to confirm your identity.</Text>
          <Button onClick={enrollEmail}>Enable email-based MFA</Button>
        </Stack>
      </Document>
    );
  }

  // Default: authenticator (TOTP) enrollment.
  return (
    <Document width={400}>
      <MfaForm title="Multi Factor Auth Setup" buttonText="Enroll" qrCodeUrl={qrCodeUrl} onSubmit={enrollTotp} />
    </Document>
  );
}
