// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Group, Skeleton, Stack } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { OperationOutcomeAlert, QuestionnaireForm, QuestionnaireResponseDisplay, useMedplum } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';

interface TaskQuestionnaireFormProps {
  task: Task;
  onChangeResponse?: (response: QuestionnaireResponse) => void;
}

export const TaskQuestionnaireForm = ({ task, onChangeResponse }: TaskQuestionnaireFormProps): JSX.Element => {
  const medplum = useMedplum();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>(undefined);
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>(undefined);

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

    setOutcome(undefined);
    setLoading(true);
    fetchResources()
      .catch((err) => {
        setOutcome(normalizeOperationOutcome(err));
      })
      .finally(() => setLoading(false));
  }, [medplum, task]);

  if (loading) {
    return <QuestionnaireSkeleton />;
  }

  return (
    <Box p={0}>
      {task.status !== 'completed' && questionnaire && (
        <QuestionnaireForm
          questionnaire={questionnaire}
          questionnaireResponse={questionnaireResponse}
          excludeButtons={true}
          onChange={onChange}
        />
      )}
      {task.status === 'completed' && questionnaireResponse && (
        <QuestionnaireResponseDisplay questionnaireResponse={questionnaireResponse} />
      )}
      {outcome && <OperationOutcomeAlert outcome={outcome} />}
    </Box>
  );
};

const QuestionnaireSkeleton = (): JSX.Element => (
  <Stack gap="lg">
    {/* Form title/header */}
    <Stack gap="xs">
      <Skeleton height={24} width="60%" />
      <Skeleton height={16} width="85%" />
    </Stack>

    {/* Question group 1 */}
    <Stack gap="sm">
      <Skeleton height={18} width="45%" />
      <Group gap="md">
        <Skeleton height={20} width={20} radius="xl" />
        <Skeleton height={16} width="15%" />
        <Skeleton height={20} width={20} radius="xl" />
        <Skeleton height={16} width="12%" />
      </Group>
    </Stack>

    {/* Question group 2 */}
    <Stack gap="sm">
      <Skeleton height={18} width="38%" />
      <Skeleton height={36} width="100%" radius="md" />
    </Stack>

    {/* Question group 3 */}
    <Stack gap="sm">
      <Skeleton height={18} width="52%" />
      <Stack gap="xs">
        <Group gap="sm">
          <Skeleton height={16} width={16} radius="sm" />
          <Skeleton height={14} width="25%" />
        </Group>
        <Group gap="sm">
          <Skeleton height={16} width={16} radius="sm" />
          <Skeleton height={14} width="30%" />
        </Group>
        <Group gap="sm">
          <Skeleton height={16} width={16} radius="sm" />
          <Skeleton height={14} width="22%" />
        </Group>
      </Stack>
    </Stack>

    {/* Text area question */}
    <Stack gap="sm">
      <Skeleton height={18} width="42%" />
      <Skeleton height={80} width="100%" radius="md" />
    </Stack>

    {/* Another radio group */}
    <Stack gap="sm">
      <Skeleton height={18} width="48%" />
      <Group gap="md">
        <Skeleton height={20} width={20} radius="xl" />
        <Skeleton height={16} width="18%" />
        <Skeleton height={20} width={20} radius="xl" />
        <Skeleton height={16} width="20%" />
        <Skeleton height={20} width={20} radius="xl" />
        <Skeleton height={16} width="16%" />
      </Group>
    </Stack>
  </Stack>
);
