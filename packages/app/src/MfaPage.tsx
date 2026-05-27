// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Center, Group, List, Modal, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { MfaMethod } from '@medplum/react';
import { Document, Logo, MfaEnrollForm, MfaForm, MfaVerificationForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

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
  const [email, setEmail] = useState<string>();
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
        setEmail(response.email);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const markEnrolled = useCallback((method: MfaMethod) => {
    setEnrolled(true);
    setEnrolledMethods((prev) => (prev.includes(method) ? prev : [...prev, method]));
  }, []);

  const enrollTotp = useCallback(
    (token: string) => {
      medplum
        .post('auth/mfa/enroll', { method: 'totp', token })
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

  // Email a verification code to the current user so they can prove control of
  // their email factor when changing MFA settings.
  const requestEmailChallenge = useCallback(async (): Promise<void> => {
    await medplum.post('auth/mfa/send-email-challenge', {});
  }, [medplum]);

  const disableMfa = useCallback(
    async (token: string): Promise<OperationOutcome> => {
      return medplum.post('auth/mfa/disable', { token });
    },
    [medplum]
  );

  const removeMethod = useCallback(
    async (method: MfaMethod, token: string): Promise<void> => {
      // This will throw if the factor failed to be removed
      await medplum.post('auth/mfa/disable', { method, token });
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
    // When email is the only connected factor, verification happens via an
    // emailed code, so send it as the verification dialog opens.
    const emailOnly = emailEnrolled && !totpEnrolled;

    const openDisable = (): void => {
      if (emailOnly) {
        requestEmailChallenge().catch((err) =>
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false })
        );
      }
      setDisabling(true);
    };

    const openRemove = (method: MfaMethod): void => {
      if (emailOnly) {
        requestEmailChallenge().catch((err) =>
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false })
        );
      }
      setRemovingMethod(method);
    };

    return (
      <Document width={400}>
        <Modal title="Disable MFA" opened={disabling} onClose={() => setDisabling(false)}>
          <MfaVerificationForm
            methods={enrolledMethods}
            email={email}
            initialEmailMode={emailOnly}
            onRequestEmailCode={requestEmailChallenge}
            onSubmit={async (token) => {
              // This will throw if MFA failed to disable
              await disableMfa(token);
              setDisabling(false);
              setEnrolled(false);
              setEnrolledMethods([]);
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
            <MfaVerificationForm
              methods={enrolledMethods}
              email={email}
              initialEmailMode={emailOnly}
              onRequestEmailCode={requestEmailChallenge}
              onSubmit={(token) => removeMethod(removingMethod, token)}
            />
          )}
        </Modal>
        <Modal opened={addingTotp} onClose={() => setAddingTotp(false)}>
          <MfaForm
            title="Add an authenticator app"
            description="Scan this QR code with your authenticator app, then enter the code it generates."
            buttonText="Enroll"
            qrCodeUrl={qrCodeUrl}
            onSubmit={(fields) => enrollTotp(fields.token)}
          />
        </Modal>
        <Stack>
          <Center py="xs" style={{ flexDirection: 'column' }}>
            <Logo size={32} />
            <Title order={3} py="md" ta="center">
              Multi-factor authentication
            </Title>
          </Center>
          <Stack pb="lg">
            <Text c="dimmed">Enabled methods:</Text>
            <List>
              {enrolledMethods.map((method) => (
                <List.Item key={method}>
                  <Group justify="space-between" wrap="nowrap">
                    <Text>{METHOD_LABELS[method]}</Text>
                    {canRemoveMethods && (
                      <Anchor href="#" c="red" onClick={() => openRemove(method)}>
                        Remove
                      </Anchor>
                    )}
                  </Group>
                </List.Item>
              ))}
            </List>
          </Stack>
          {(canAddEmail || canAddTotp) && (
            <Stack>
              {canAddEmail && (
                <Button variant="default" onClick={enrollEmail}>
                  Add email-based MFA
                </Button>
              )}
              {canAddTotp && (
                <Button variant="default" onClick={() => setAddingTotp(true)}>
                  Add an authenticator app
                </Button>
              )}
            </Stack>
          )}

          <Group>
            <Button color="red" variant="outline" onClick={openDisable} fullWidth>
              Disable MFA
            </Button>
          </Group>
        </Stack>
      </Document>
    );
  }

  // Not yet enrolled: chooser, email-only, or authenticator (TOTP) enrollment.
  return (
    <Document width={400}>
      <MfaEnrollForm
        allowedMethods={allowedMethods}
        qrCodeUrl={qrCodeUrl}
        onEnrollEmail={enrollEmail}
        onEnrollTotp={enrollTotp}
        totpTitle="Multi Factor Auth Setup"
      />
    </Document>
  );
}
