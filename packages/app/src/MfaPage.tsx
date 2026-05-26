// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { MfaFormFields } from '@medplum/react';
import { Document, MfaForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

type MfaMethod = 'totp' | 'email';

export function MfaPage(): JSX.Element | null {
  const medplum = useMedplum();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>();
  const [enrolled, setEnrolled] = useState<boolean | undefined>(undefined);
  const [allowedMethods, setAllowedMethods] = useState<MfaMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod>();
  const [disabling, setDisabling] = useState(false);

  const fetchStatus = useCallback(() => {
    medplum
      .get('auth/mfa/status', { cache: 'no-cache' })
      .then((response) => {
        setQrCodeUrl(response.enrollQrCode);
        setEnrolled(response.enrolled);
        setAllowedMethods(response.allowedMethods ?? ['totp']);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const enrollTotp = useCallback(
    (formData: Record<MfaFormFields, string>) => {
      medplum
        .post('auth/mfa/enroll', { method: 'totp', token: formData.token })
        .then(() => {
          setEnrolled(true);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
    },
    [medplum]
  );

  const enrollEmail = useCallback(() => {
    medplum
      .post('auth/mfa/enroll', { method: 'email' })
      .then(() => {
        setEnrolled(true);
        showNotification({ color: 'green', message: 'Email-based MFA enabled' });
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum]);

  const disableMfa = useCallback(
    async (formData: Record<MfaFormFields, string>): Promise<OperationOutcome> => {
      return medplum.post('auth/mfa/disable', { token: formData.token });
    },
    [medplum]
  );

  if (enrolled === undefined) {
    return null;
  }

  if (enrolled) {
    return (
      <Document>
        <Modal title="Disable MFA" opened={disabling} onClose={() => setDisabling(false)}>
          <MfaForm
            title="Disable MFA"
            buttonText="Submit code"
            onSubmit={async (formData) => {
              // This will throw if MFA failed to disable
              await disableMfa(formData);
              setDisabling(false);
              setEnrolled(false);
              setSelectedMethod(undefined);
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
        <Group>
          <Title>MFA is enabled</Title>
          <Button onClick={() => setDisabling(true)}>Disable MFA</Button>
        </Group>
      </Document>
    );
  }

  const emailAllowed = allowedMethods.includes('email');
  const totpAllowed = allowedMethods.includes('totp');

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
