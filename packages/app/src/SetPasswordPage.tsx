// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SetPasswordForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';

export function SetPasswordPage(): JSX.Element {
  const { id, secret } = useParams() as { id: string; secret: string };
  const navigate = useNavigate();

  return <SetPasswordForm id={id} secret={secret} onSignIn={() => navigate('/signin')?.catch(console.error)} />;
}
