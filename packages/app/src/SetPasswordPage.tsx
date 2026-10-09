// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SetPasswordForm } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from './useAppNavigate';

export function SetPasswordPage(): JSX.Element {
  const { id, secret } = useParams() as { id: string; secret: string };
  const navigate = useAppNavigate();

  return <SetPasswordForm id={id} secret={secret} onSignIn={() => navigate('/signin')} />;
}
