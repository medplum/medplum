import { QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { TaskQuestionnaireForm } from './TaskQuestionnaireForm';
import { SimpleTask } from './SimpleTask';
import { Card, Stack } from '@mantine/core';
import { TaskStatusPanel } from './TaskStatusPanel';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface TaskPanelProps {
  task: Task;
  onSaveQuestionnaire: (task: Task, response: QuestionnaireResponse) => void;
}
export const TaskPanel = ({ task, onSaveQuestionnaire }: TaskPanelProps): JSX.Element => {
  const navigate = useNavigate();
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(undefined);
  const [isQuestionnaire, setIsQuestionnaire] = useState<boolean>(false);

  useEffect(() => {
    setIsQuestionnaire(questionnaireResponse !== undefined && !task.output?.[0]?.valueReference)
  }, [task, questionnaireResponse]);

  const onSubmit = async (): Promise<void> => {
    if (questionnaireResponse && isQuestionnaire) {
      onSaveQuestionnaire(task, questionnaireResponse);
    } else {
      navigate(`Task/${task.id}`)
    }
  };

  const onChangeResponse = (response: QuestionnaireResponse): void => {
    setQuestionnaireResponse(response);
  }

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs">
        {task.input && task.input[0]?.type?.text === 'Questionnaire' && task.input[0]?.valueReference ? (
          <TaskQuestionnaireForm key={task.id} task={task} onChangeResponse={onChangeResponse} />
        ) : (
          <SimpleTask key={task.id} task={task} />
        )}
       <TaskStatusPanel
          task={task}
          onSubmit={onSubmit}
          isQuestionnaire={isQuestionnaire}
        />
      </Stack>
    </Card>
  );
};
