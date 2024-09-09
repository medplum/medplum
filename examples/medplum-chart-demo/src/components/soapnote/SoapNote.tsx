import { Box, Flex, Text } from '@mantine/core';
import { Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function SoapNote(): JSX.Element {
  const { id } = useParams();
  const medplum = useMedplum();
  const [submitted, setSubmitted] = useState(false);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>();

  useEffect(() => {
    medplum.searchOne('Questionnaire', 'name:contains=SOAP').then(setQuestionnaire).catch(console.log);
  }, [medplum]);

  if (!questionnaire) {
    return <div>Loading...</div>;
  }

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
      for: {
        reference: `Patient/${id}`,
      },
    };
    await medplum.createResource(newTask);
    setSubmitted(true);
  }

  return (
    <Box w="37.5%">
      <Document>
        <QuestionnaireForm questionnaire={questionnaire} onSubmit={!submitted ? handleSubmit : console.log} />

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
