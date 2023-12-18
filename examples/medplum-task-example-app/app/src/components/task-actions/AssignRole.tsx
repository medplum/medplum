import { Button, Modal } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { assignRoleQuestionnaire } from './questionnaires';

interface AssignTaskProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function AssignRole(props: AssignTaskProps): JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const medplum = useMedplum();

  const handleOpenClose = (): void => {
    setIsOpen(!isOpen);
  };

  const onQuestionnaireSubmit = (): void => {};

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose}>
        Assign to a Role
      </Button>
      <Modal opened={isOpen} onClose={handleOpenClose}>
        <QuestionnaireForm questionnaire={assignRoleQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}
