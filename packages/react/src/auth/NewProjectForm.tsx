import { LoginAuthenticationResponse } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Button } from '../Button';
import { Form } from '../Form';
import { FormSection } from '../FormSection';
import { Input } from '../Input';
import { Logo } from '../Logo';
import { useMedplum } from '../MedplumProvider';

export interface NewProjectFormProps {
  login: string;
  handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function NewProjectForm(props: NewProjectFormProps): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  return (
    <Form
      style={{ maxWidth: 400 }}
      onSubmit={async (formData: Record<string, string>) => {
        try {
          props.handleAuthResponse(
            await medplum.startNewProject({
              login: props.login,
              projectName: formData.projectName,
            })
          );
        } catch (err) {
          setOutcome(err as OperationOutcome);
        }
      }}
    >
      <div className="medplum-center">
        <Logo size={32} />
        <h1>Create project</h1>
      </div>
      <FormSection title="Project Name" htmlFor="projectName" outcome={outcome}>
        <Input
          name="projectName"
          type="text"
          testid="projectName"
          placeholder="My Project"
          required={true}
          outcome={outcome}
        />
      </FormSection>
      <p style={{ fontSize: '12px', color: '#888' }}>
        By clicking submit you agree to the Medplum <a href="https://www.medplum.com/privacy">Privacy&nbsp;Policy</a>
        {' and '}
        <a href="https://www.medplum.com/terms">Terms&nbsp;of&nbsp;Service</a>.
      </p>
      <div className="medplum-signin-buttons">
        <div />
        <div>
          <Button type="submit" testid="submit">
            Create project
          </Button>
        </div>
      </div>
    </Form>
  );
}
