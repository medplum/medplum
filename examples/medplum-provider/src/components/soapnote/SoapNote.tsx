import { Box, Flex, Text } from '@mantine/core';
import { createReference } from '@medplum/core';
import { QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { usePatient } from '../../hooks/usePatient';
import { defaultSoapNoteQuestionnaire } from './SoapNote.questionnaire';

export function SoapNote(): JSX.Element {
  const medplum = useMedplum();
  const patient = usePatient();
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(questionnaireResponse: QuestionnaireResponse): Promise<void> {
    const response = await medplum.createResource(questionnaireResponse);

    const newTask: Task = {
      resourceType: 'Task',
      status: 'ready',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: 'LL1474-7',
            display: 'Physician menopause management note',
          },
        ],
      },
      focus: {
        reference: `QuestionnaireResponse/${response.id}`,
      },
      for: patient ? createReference(patient) : undefined,
    };
    await medplum.createResource(newTask);
    setSubmitted(true);
  }

  return (
    <Box w="37.5%">
      <Document>
        <QuestionnaireForm
          questionnaire={defaultSoapNoteQuestionnaire}
          onSubmit={!submitted ? handleSubmit : console.log}
        />
        {submitted ? (
          <Flex justify="flex-end" mt={8}>
            <Text mr={8}>Submitted</Text>
            <IconCircleCheck color="#79d290" size={24} />
          </Flex>
        ) : null}
      </Document>
    </Box>
  );
}
