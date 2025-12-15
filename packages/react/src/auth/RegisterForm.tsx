// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import type { LoginAuthenticationResponse } from '@medplum/core';
import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import { Logo } from '../Logo/Logo';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { getAppName } from '../utils/app';
import { getIssuesForExpression } from '../utils/outcomes';
import { NewProjectForm } from './NewProjectForm';
import { NewUserForm } from './NewUserForm';
import { SignInForm } from './SignInForm';

export interface RegisterFormProps {
  readonly type: 'patient' | 'project';
  readonly projectId?: string;
  readonly clientId?: string;
  readonly googleClientId?: string;
  readonly recaptchaSiteKey?: string;
  readonly children?: ReactNode;
  readonly onSuccess: () => void;
}

export function RegisterForm(props: RegisterFormProps): JSX.Element {
  const { type, projectId, clientId, googleClientId, recaptchaSiteKey, onSuccess } = props;
  const medplum = useMedplum();
  const [login, setLogin] = useState<string>();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    if (type === 'patient' && login) {
      medplum
        .startNewPatient({ login, projectId: projectId as string })
        .then((response) => medplum.processCode(response.code as string))
        .then(() => onSuccess())
        .catch((err) => setOutcome(normalizeOperationOutcome(err)));
    }
  }, [medplum, type, projectId, login, onSuccess]);

  function handleAuthResponse(response: LoginAuthenticationResponse): void {
    if (response.code) {
      medplum
        .processCode(response.code)
        .then(() => onSuccess())
        .catch((err) => setOutcome(normalizeOperationOutcome(err)));
    } else if (response.login) {
      setLogin(response.login);
    }
  }

  const issues = getIssuesForExpression(outcome, undefined);

  // If showing sign-in form for project registration
  if (showSignIn && type === 'project' && projectId === 'new' && !login) {
    return (
      <SignInForm projectId="new" googleClientId={googleClientId} onSuccess={onSuccess}>
        <Logo size={32} />
        <Title>Sign In to {getAppName()}</Title>
        <div>Sign In to create a new project</div>
      </SignInForm>
    );
  }

  return (
    <Document width={400} px="xl" py="xl" bdrs="md">
      <OperationOutcomeAlert issues={issues} mb="lg" />
      {!login && (
        <NewUserForm
          projectId={projectId as string}
          clientId={clientId}
          googleClientId={googleClientId}
          recaptchaSiteKey={recaptchaSiteKey}
          handleAuthResponse={handleAuthResponse}
          onSignIn={type === 'project' && projectId === 'new' ? () => setShowSignIn(true) : undefined}
        >
          {props.children}
        </NewUserForm>
      )}
      {login && type === 'project' && <NewProjectForm login={login} handleAuthResponse={handleAuthResponse} />}
    </Document>
  );
}
