// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import { Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { Loading, QuestionnaireForm, useMedplum } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

interface TaskQuestionnaireFormProps {
  task: Task;
  onChangeResponse?: (response: QuestionnaireResponse) => void;
}

export const TaskQuestionnaireForm = ({ task, onChangeResponse }: TaskQuestionnaireFormProps): JSX.Element => {
  const medplum = useMedplum();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>(undefined);
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const onChange = (response: QuestionnaireResponse): void => {
    const baseResponse = questionnaireResponse || response;
    const updatedResponse: QuestionnaireResponse = {
      ...baseResponse,
      item: response.item,
      status: 'in-progress',
    };

    onChangeResponse?.(updatedResponse);
  };

  useEffect(() => {
    const fetchResources = async (): Promise<void> => {
      const questionnaireReference = task.input?.[0]?.valueReference as Reference<Questionnaire>;
      const questionnaireResponseReference = task.output?.[0]?.valueReference as Reference<QuestionnaireResponse>;

      if (questionnaireResponseReference) {
        const response = await medplum.readReference(questionnaireResponseReference);
        setQuestionnaireResponse(response as QuestionnaireResponse);
      }

      if (questionnaireReference) {
        const questionnaireResponse = await medplum.readReference(questionnaireReference);
        setQuestionnaire(questionnaireResponse as Questionnaire);
      }
    };

    setLoading(true);
    fetchResources()
      .catch(showErrorNotification)
      .finally(() => setLoading(false));
  }, [medplum, task]);

  if (loading) {
    return (
      <Box p="md">
        <Loading />
      </Box>
    );
  }

  return (
    <Box p="md">
      {questionnaire && (
        <QuestionnaireForm
          questionnaire={questionnaire}
          questionnaireResponse={questionnaireResponse}
          excludeButtons={true}
          onChange={onChange}
        />
      )}
    </Box>
  );
};
