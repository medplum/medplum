import { Modal } from '@mantine/core';
import { getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';
import { dueDateQuestionnaire } from '../data/questionnaires';

interface AddDueDateModalProps {
  onAddDate: (date: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function AddDueDateModal(props: AddDueDateModalProps): JSX.Element {
  const handleDueDateSubmit = (formData: QuestionnaireResponse) => {
    const dueDate = getQuestionnaireAnswers(formData)['due-date'].valueDate;

    if (dueDate) {
      props.onAddDate(dueDate);
    }

    props.onClose();
  };

  return (
    <Modal opened={props.isOpen} onClose={props.onClose}>
      <QuestionnaireForm questionnaire={dueDateQuestionnaire} onSubmit={handleDueDateSubmit} />
    </Modal>
  );
}
