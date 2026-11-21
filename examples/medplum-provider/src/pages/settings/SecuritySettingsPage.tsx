// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDateTime, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Reference } from '@medplum/fhirtypes';
import type { MfaMethod } from '@medplum/react';
import {
  Form,
  getErrorsForInput,
  MfaEnrollForm,
  MfaVerificationForm,
  OperationOutcomeAlert,
  PasswordInput,
  SubmitButton,
  useMedplum,
} from '@medplum/react';
import { IconDevices, IconShieldLock } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { SettingsPage, SettingsRow, SettingsSection } from '../../components/settings/SettingsLayout';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

const METHOD_LABELS: Record<MfaMethod, string> = {
  totp: 'Authenticator app',
  email: 'Email',
};

interface UserSession {
  readonly id: string;
  readonly lastUpdated: string;
  readonly authMethod: string;
  readonly remoteAddress: string;
  readonly browser?: string;
  readonly os?: string;
  readonly project?: Reference;
}

interface MfaStatus {
  readonly enrolled: boolean;
  readonly enrolledMethods?: MfaMethod[];
  readonly allowedMethods?: MfaMethod[];
  readonly mfaRequired?: boolean;
  readonly enrollQrCode?: string;
  readonly email?: string;
}

export function SecuritySettingsPage(): JSX.Element {
  const medplum = useMedplum();
  const [sessions, setSessions] = useState<UserSession[]>();
  const [mfa, setMfa] = useState<MfaStatus>();
  const [passwordOpened, passwordHandlers] = useDisclosure(false);
  const [enrollOpened, enrollHandlers] = useDisclosure(false);
  const [emailVerifyOpened, emailVerifyHandlers] = useDisclosure(false);
  const [disableOpened, disableHandlers] = useDisclosure(false);

  const loadSessions = useCallback(() => {
    medplum
      .get('auth/me', { cache: 'no-cache' })
      .then((details) => setSessions(details.security?.sessions ?? []))
      .catch(showErrorNotification);
  }, [medplum]);

  const loadMfa = useCallback(() => {
    medplum.get('auth/mfa/status', { cache: 'no-cache' }).then(setMfa).catch(showErrorNotification);
  }, [medplum]);

  useEffect(() => {
    loadSessions();
    loadMfa();
  }, [loadSessions, loadMfa]);

  const requestEmailChallenge = useCallback(async (): Promise<void> => {
    await medplum.post('auth/mfa/send-email-challenge', {});
  }, [medplum]);

  function revokeSession(loginId: string): void {
    medplum
      .post('auth/revoke', { loginId })
      .then(() => {
        showSuccessNotification({ message: 'Session revoked' });
        loadSessions();
      })
      .catch(showErrorNotification);
  }

  async function enrollTotp(token: string): Promise<void> {
    try {
      await medplum.post('auth/mfa/enroll', { method: 'totp', token });
      enrollHandlers.close();
      showSuccessNotification({ message: 'Authenticator app enabled' });
      loadMfa();
    } catch (err) {
      showErrorNotification(err);
    }
  }

  function startEmailEnroll(): void {
    requestEmailChallenge()
      .then(() => {
        enrollHandlers.close();
        emailVerifyHandlers.open();
      })
      .catch(showErrorNotification);
  }

  const enrolledMethods = mfa?.enrolledMethods ?? [];
  const emailOnly = enrolledMethods.includes('email') && !enrolledMethods.includes('totp');

  function openDisable(): void {
    if (emailOnly) {
      requestEmailChallenge().catch(showErrorNotification);
    }
    disableHandlers.open();
  }

  return (
    <SettingsPage title="Security" description="Manage how you sign in and where you're signed in.">
      <SettingsSection
        title="Authentication"
        description="Your password and second sign-in step."
        icon={<IconShieldLock size={22} />}
      >
        <SettingsRow label="Password" description="Change the password you use to sign in.">
          <Button variant="default" onClick={passwordHandlers.open}>
            Change password
          </Button>
        </SettingsRow>
        <SettingsRow
          label="Multi-factor authentication"
          description={
            mfa?.enrolled ? (
              <>Enabled with {enrolledMethods.map((m) => METHOD_LABELS[m]).join(' and ')}.</>
            ) : (
              'Require a second step when signing in.'
            )
          }
        >
          {mfa &&
            (mfa.enrolled ? (
              <Group gap="sm">
                <Badge color="green" variant="light">
                  Enabled
                </Badge>
                {!mfa.mfaRequired && (
                  <Button variant="default" color="red" onClick={openDisable}>
                    Disable
                  </Button>
                )}
              </Group>
            ) : (
              <Button variant="default" onClick={enrollHandlers.open}>
                Set up
              </Button>
            ))}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Sessions"
        description="Devices currently signed in to your account."
        icon={<IconDevices size={22} />}
      >
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Device</Table.Th>
              <Table.Th>IP address</Table.Th>
              <Table.Th>Method</Table.Th>
              <Table.Th>Last active</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sessions?.map((session) => (
              <Table.Tr key={session.id}>
                <Table.Td>
                  <Text size="sm">{[session.browser, session.os].filter(Boolean).join(' on ') || 'Unknown'}</Text>
                  <Text size="xs" c="dimmed">
                    {session.project?.display}
                  </Text>
                </Table.Td>
                <Table.Td>{session.remoteAddress}</Table.Td>
                <Table.Td>{session.authMethod}</Table.Td>
                <Table.Td>{formatDateTime(session.lastUpdated)}</Table.Td>
                <Table.Td ta="right">
                  <Button variant="subtle" color="red" size="compact-sm" onClick={() => revokeSession(session.id)}>
                    Revoke
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </SettingsSection>

      <Modal title="Change password" opened={passwordOpened} onClose={passwordHandlers.close} centered>
        <ChangePasswordFields onSuccess={passwordHandlers.close} />
      </Modal>
      <Modal opened={enrollOpened} onClose={enrollHandlers.close} centered>
        {mfa && (
          <MfaEnrollForm
            allowedMethods={mfa.allowedMethods ?? ['totp']}
            qrCodeUrl={mfa.enrollQrCode}
            onEnrollEmail={startEmailEnroll}
            onEnrollTotp={enrollTotp}
            totpTitle="Set up an authenticator app"
          />
        )}
      </Modal>
      <Modal title="Verify your email" opened={emailVerifyOpened} onClose={emailVerifyHandlers.close} centered>
        <MfaVerificationForm
          methods={['email']}
          email={mfa?.email}
          initialEmailMode
          onRequestEmailCode={requestEmailChallenge}
          onSubmit={async (token) => {
            await medplum.post('auth/mfa/enroll', { method: 'email', token });
            emailVerifyHandlers.close();
            showSuccessNotification({ message: 'Email-based MFA enabled' });
            loadMfa();
          }}
          buttonText="Verify and enable"
        />
      </Modal>
      <Modal title="Disable MFA" opened={disableOpened} onClose={disableHandlers.close} centered>
        <MfaVerificationForm
          methods={enrolledMethods}
          email={mfa?.email}
          initialEmailMode={emailOnly}
          onRequestEmailCode={requestEmailChallenge}
          onSubmit={async (token) => {
            await medplum.post('auth/mfa/disable', { token });
            disableHandlers.close();
            showSuccessNotification({ message: 'MFA disabled' });
            loadMfa();
          }}
        />
      </Modal>
    </SettingsPage>
  );
}

function ChangePasswordFields(props: { readonly onSuccess: () => void }): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();

  return (
    <Form
      onSubmit={async (formData: Record<string, string>) => {
        setOutcome(undefined);
        try {
          await medplum.post('auth/changepassword', formData);
          showSuccessNotification({ message: 'Password changed' });
          props.onSuccess();
        } catch (err) {
          setOutcome(normalizeOperationOutcome(err));
        }
      }}
    >
      <Stack>
        <OperationOutcomeAlert outcome={outcome} />
        <PasswordInput
          name="oldPassword"
          label="Current password"
          required
          autoFocus
          error={getErrorsForInput(outcome, 'oldPassword')}
        />
        <PasswordInput
          name="newPassword"
          label="New password"
          required
          error={getErrorsForInput(outcome, 'newPassword')}
        />
        <PasswordInput
          name="confirmPassword"
          label="Confirm new password"
          required
          error={getErrorsForInput(outcome, 'confirmPassword')}
        />
        <Group justify="flex-end">
          <SubmitButton>Change password</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}
