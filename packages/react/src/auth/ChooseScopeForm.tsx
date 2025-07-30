import { Center, Checkbox, Group, Stack, Title } from '@mantine/core';
import { LoginAuthenticationResponse } from '@medplum/core';
import { useMedplum } from '@medplum/react-hooks';
import { JSX } from 'react';
import { Fragment } from 'react/jsx-runtime';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { Logo } from '../Logo/Logo';

export interface ChooseScopeFormProps {
  readonly login: string;
  readonly scope: string | undefined;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

const openConditionScope = /^patient\/Condition\.(?:\*|c?r?u?d?s?)$/;
const encounterDiagnosis = '?category=http://terminology.hl7.org/CodeSystem/condition-category|encounter-diagnosis';
const problemListItem = '?category=http://terminology.hl7.org/CodeSystem/condition-category|problem-list-item';
const healthConcern = '?category=http://hl7.org/fhir/us/core/CodeSystem/condition-category|health-concern';

const openObservationScope = /^patient\/Observation\.(?:\*|c?r?u?d?s?)$/;
const clinicalTest = '?category=http://hl7.org/fhir/us/core/CodeSystem/us-core-observation-category|clinical-test';
const laboratory = '?category=http://terminology.hl7.org/CodeSystem/observation-category|laboratory';
const socialHistory = '?category=http://terminology.hl7.org/CodeSystem/observation-category|social-history';
const sdoh = '?category=http://hl7.org/fhir/us/core/CodeSystem/us-core-category|sdoh';
const survey = '?category=http://terminology.hl7.org/CodeSystem/observation-category|survey';
const vitalSigns = '?category=http://terminology.hl7.org/CodeSystem/observation-category|vital-signs';

export function ChooseScopeForm(props: ChooseScopeFormProps): JSX.Element {
  const medplum = useMedplum();
  return (
    <Form
      onSubmit={(formData: Record<string, string>) => {
        medplum
          .post('auth/scope', {
            login: props.login,
            scope: Object.keys(formData).join(' '),
          })
          .then(props.handleAuthResponse)
          .catch(console.log);
      }}
    >
      <Stack>
        <Center style={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title>Choose scope</Title>
        </Center>
        <Stack>
          {(props.scope ?? 'openid').split(' ').map((scopeName: string) => {
            let additionalScopes: string[] | undefined;
            if (openConditionScope.test(scopeName)) {
              additionalScopes = [
                scopeName + encounterDiagnosis,
                scopeName + problemListItem,
                scopeName + healthConcern,
              ];
            } else if (openObservationScope.test(scopeName)) {
              additionalScopes = [
                scopeName + clinicalTest,
                scopeName + laboratory,
                scopeName + socialHistory,
                scopeName + sdoh,
                scopeName + survey,
                scopeName + vitalSigns,
              ];
            }
            return (
              <Fragment key={scopeName + '_group'}>
                <Checkbox key={scopeName} id={scopeName} name={scopeName} label={scopeName} defaultChecked />
                {additionalScopes?.map((scope) => (
                  <Checkbox key={scope} id={scope} name={scope} label={scope} />
                ))}
              </Fragment>
            );
          })}
        </Stack>
        <Group justify="flex-end" mt="xl">
          <SubmitButton>Set scope</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}
