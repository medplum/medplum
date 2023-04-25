import { LoginAuthenticationResponse } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { NewProjectForm } from './NewProjectForm';
import { NewUserForm } from './NewUserForm';

export interface RegisterFormProps {
  readonly type: 'patient' | 'project';
  readonly projectId?: string;
  readonly googleClientId?: string;
  readonly recaptchaSiteKey?: string;
  readonly children?: React.ReactNode;
  readonly onSuccess: () => void;
}

export function RegisterForm(props: RegisterFormProps): JSX.Element {
  const { type, projectId, googleClientId, recaptchaSiteKey, onSuccess } = props;
  const medplum = useMedplum();
  const [login, setLogin] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<OperationOutcome>();

  useEffect(() => {
    if (type === 'patient' && login) {
      medplum
        .startNewPatient({ login, projectId: projectId as string })
        .then((response) => medplum.processCode(response.code as string))
        .then(() => onSuccess())
        .catch((err) => setOutcome(err as OperationOutcome));
    }
  }, [medplum, type, projectId, login, onSuccess]);

  function handleAuthResponse(response: LoginAuthenticationResponse): void {
    if (response.code) {
      medplum
        .processCode(response.code)
        .then(() => onSuccess())
        .catch(console.log);
    } else if (response.login) {
      setLogin(response.login);
    }
  }

  return (
    <Document width={450}>
      {outcome && <pre>{JSON.stringify(outcome, null, 2)}</pre>}
      {!login && (
        <NewUserForm
          projectId={projectId as string}
          googleClientId={googleClientId}
          recaptchaSiteKey={recaptchaSiteKey}
          handleAuthResponse={handleAuthResponse}
        >
          {props.children}
        </NewUserForm>
      )}
      {login && type === 'project' && <NewProjectForm login={login} handleAuthResponse={handleAuthResponse} />}
    </Document>
  );
}
