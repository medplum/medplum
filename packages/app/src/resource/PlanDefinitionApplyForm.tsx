import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { PlanDefinition, Reference, RequestGroup } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Form, FormSection, MedplumLink, ReferenceInput, useMedplum } from '@medplum/react';
import { useState } from 'react';

export interface PlanDefinitionApplyFormProps {
  readonly planDefinition: PlanDefinition;
}

export function PlanDefinitionApplyForm(props: PlanDefinitionApplyFormProps): JSX.Element {
  const medplum = useMedplum();
  const [subject, setSubject] = useState<Reference>();
  const [result, setResult] = useState<RequestGroup>();

  if (result) {
    return (
      <>
        <p>Request group created successfully.</p>
        <ul>
          <li>
            Go to the{' '}
            <MedplumLink to={result} suffix="checklist">
              Request Group
            </MedplumLink>
          </li>
          <li>
            Back to the <MedplumLink to={props.planDefinition}>Plan Definition</MedplumLink>
          </li>
        </ul>
      </>
    );
  }

  return (
    <Form
      onSubmit={() => {
        medplum
          .post(medplum.fhirUrl('PlanDefinition', props.planDefinition.id as string, '$apply'), {
            resourceType: 'Parameters',
            parameter: [
              {
                name: 'subject',
                valueString: subject?.reference,
              },
            ],
          })
          .then(setResult)
          .catch(console.log);
      }}
    >
      <Stack>
        <Title>Start "{props.planDefinition.title}"</Title>
        <Text>
          Use the <strong>Apply</strong> operation to create a group of tasks for a workflow.
        </Text>
        <Text>The following tasks will be created:</Text>
        <ul>
          {props.planDefinition.action?.map((action, index) => (
            <li key={`action-${index}`}>
              {action.definitionCanonical?.startsWith('Questionnaire/') && 'Questionnaire request: '}
              {action.title && <>{action.title}</>}
              {action.code && <CodeableConceptDisplay value={action.code[0]} />}
            </li>
          ))}
        </ul>
        <FormSection title="Subject">
          <ReferenceInput
            name="subject"
            targetTypes={['Patient', 'Practitioner']}
            defaultValue={subject}
            onChange={setSubject}
          />
        </FormSection>
        <Group justify="flex-end" mt="xl">
          <Button type="submit">Go</Button>
        </Group>
      </Stack>
    </Form>
  );
}
