// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Group, Modal, PasswordInput, Radio, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { User } from '@medplum/fhirtypes';
import { Form, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

export type MfaMethod = 'totp' | 'email';

const MFA_METHOD_LABELS: Record<MfaMethod, string> = {
  totp: 'Authenticator app (TOTP)',
  email: 'Email',
};

/**
 * Returns the MFA methods a user is enrolled in. Users enrolled before `User.mfaMethod`
 * existed are treated as TOTP-only, mirroring the server's `getEnrolledMfaMethods`.
 * @param user - The user to inspect, if loaded.
 * @returns The enrolled MFA methods, or an empty array.
 */
function getEnrolledMfaMethods(user: User | undefined): MfaMethod[] {
  if (!user) {
    return [];
  }
  if (user.mfaMethod && user.mfaMethod.length > 0) {
    return user.mfaMethod;
  }
  return user.mfaEnrolled ? ['totp'] : [];
}

export interface ResetMfaModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly projectId: string;
  readonly membershipId: string;
  /** The methods the member is enrolled in, when known. Used to constrain the choices. */
  readonly enrolledMethods?: MfaMethod[];
  readonly onSuccess?: () => void;
}

/**
 * Modal that lets a project admin reset a single MFA factor for a member.
 * Defaults to TOTP; when `enrolledMethods` is known, methods the member is not
 * enrolled in are disabled and the initial selection prefers an enrolled method.
 * @param props - The component props.
 * @returns The rendered element.
 */
export function ResetMfaModal(props: ResetMfaModalProps): JSX.Element {
  const medplum = useMedplum();
  const { enrolledMethods } = props;
  const initialMethod: MfaMethod =
    enrolledMethods && !enrolledMethods.includes('totp') && enrolledMethods.includes('email') ? 'email' : 'totp';
  const [method, setMethod] = useState<MfaMethod>(initialMethod);
  const [submitting, setSubmitting] = useState(false);

  function isDisabled(m: MfaMethod): boolean {
    return enrolledMethods !== undefined && !enrolledMethods.includes(m);
  }

  function handleSubmit(): void {
    setSubmitting(true);
    medplum
      .resetMemberMfa(props.projectId, props.membershipId, method)
      .then(() => {
        showNotification({
          color: 'green',
          message: `Reset ${MFA_METHOD_LABELS[method]} MFA. The member has been emailed a notice.`,
        });
        props.onSuccess?.();
        props.onClose();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setSubmitting(false));
  }

  return (
    <Modal opened={props.opened} onClose={props.onClose} title="Reset MFA" centered>
      <Form onSubmit={handleSubmit}>
        <Stack>
          <Text size="sm">
            Reset a multi-factor authentication factor for this member. Resetting the authenticator app rotates their
            secret so a lost device cannot be reused. Any other enrolled factors are left in place.
          </Text>
          <Radio.Group value={method} onChange={(v) => setMethod(v as MfaMethod)} label="Factor to reset">
            <Stack gap="xs" mt="xs">
              <Radio value="totp" label={MFA_METHOD_LABELS.totp} disabled={isDisabled('totp')} />
              <Radio value="email" label={MFA_METHOD_LABELS.email} disabled={isDisabled('email')} />
            </Stack>
          </Radio.Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" color="red" loading={submitting} disabled={isDisabled(method)}>
              Reset MFA
            </Button>
          </Group>
        </Stack>
      </Form>
    </Modal>
  );
}

export interface SendPasswordResetModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly projectId: string;
  readonly membershipId: string;
  readonly onSuccess?: () => void;
}

/**
 * Modal that confirms sending a password reset email to a member.
 * @param props - The component props.
 * @returns The rendered element.
 */
export function SendPasswordResetModal(props: SendPasswordResetModalProps): JSX.Element {
  const medplum = useMedplum();
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(): void {
    setSubmitting(true);
    medplum
      .sendMemberPasswordReset(props.projectId, props.membershipId)
      .then(() => {
        showNotification({ color: 'green', message: 'Password reset email sent.' });
        props.onSuccess?.();
        props.onClose();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setSubmitting(false));
  }

  return (
    <Modal opened={props.opened} onClose={props.onClose} title="Send password reset email" centered>
      <Stack>
        <Text size="sm">
          Send this member an email with a single-use link to set a new password. Their current password remains valid
          until they complete the reset.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button color="blue" loading={submitting} onClick={handleSubmit}>
            Send email
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export interface SetPasswordModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly projectId: string;
  readonly email: string;
  readonly onSuccess?: () => void;
}

/**
 * Modal that lets an admin set a member's password directly (no email round-trip).
 * Uses the existing `admin/projects/setpassword` endpoint, which is keyed by email.
 * @param props - The component props.
 * @returns The rendered element.
 */
export function SetPasswordModal(props: SetPasswordModalProps): JSX.Element {
  const medplum = useMedplum();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(): void {
    setSubmitting(true);
    medplum
      .post('admin/projects/setpassword', { email: props.email, password })
      .then(() => {
        showNotification({ color: 'green', message: 'Password updated.' });
        setPassword('');
        props.onSuccess?.();
        props.onClose();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setSubmitting(false));
  }

  return (
    <Modal opened={props.opened} onClose={props.onClose} title="Set password" centered>
      <Form onSubmit={handleSubmit}>
        <Stack>
          <Text size="sm">
            Set a new password for this member directly. They are not emailed. Use this only when a manual reset is
            required; otherwise prefer sending a password reset email.
          </Text>
          <PasswordInput
            label="New password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            description="At least 8 characters"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" color="red" loading={submitting} disabled={password.length < 8}>
              Set password
            </Button>
          </Group>
        </Stack>
      </Form>
    </Modal>
  );
}

export interface AccountSecurityCardProps {
  readonly projectId: string;
  readonly membershipId: string;
  readonly user: User;
}

/**
 * Admin-only card shown on the member detail page. Displays the member's MFA status
 * and exposes account administration actions: reset MFA, send a password reset email,
 * and set a password directly.
 * @param props - The component props.
 * @returns The rendered element.
 */
export function AccountSecurityCard(props: AccountSecurityCardProps): JSX.Element {
  const { user } = props;
  const enrolledMethods = getEnrolledMfaMethods(user);
  const [resetMfaOpened, resetMfa] = useDisclosure(false);
  const [sendResetOpened, sendReset] = useDisclosure(false);
  const [setPasswordOpened, setPasswordDisc] = useDisclosure(false);

  return (
    <>
      <Title mt="md">Account Security</Title>
      <Stack gap="sm">
        <Group gap="xs">
          <Text fw={500} size="sm">
            MFA:
          </Text>
          {enrolledMethods.length > 0 ? (
            enrolledMethods.map((m) => (
              <Badge key={m} color="green" variant="light">
                {MFA_METHOD_LABELS[m]}
              </Badge>
            ))
          ) : (
            <Badge color="gray" variant="light">
              Not enrolled
            </Badge>
          )}
          {user.mfaRequired && (
            <Badge color="orange" variant="light">
              Required
            </Badge>
          )}
        </Group>
        {!user.email && (
          <Alert color="yellow">This member has no email address, so password reset emails cannot be sent.</Alert>
        )}
        <Group>
          <Button variant="outline" color="red" onClick={resetMfa.open} disabled={enrolledMethods.length === 0}>
            Reset MFA
          </Button>
          <Button variant="outline" onClick={sendReset.open} disabled={!user.email}>
            Send password reset email
          </Button>
          <Button variant="outline" color="red" onClick={setPasswordDisc.open} disabled={!user.email}>
            Set password
          </Button>
        </Group>
      </Stack>

      <ResetMfaModal
        opened={resetMfaOpened}
        onClose={resetMfa.close}
        projectId={props.projectId}
        membershipId={props.membershipId}
        enrolledMethods={enrolledMethods}
      />
      <SendPasswordResetModal
        opened={sendResetOpened}
        onClose={sendReset.close}
        projectId={props.projectId}
        membershipId={props.membershipId}
      />
      {user.email && (
        <SetPasswordModal
          opened={setPasswordOpened}
          onClose={setPasswordDisc.close}
          projectId={props.projectId}
          email={user.email}
        />
      )}
    </>
  );
}
