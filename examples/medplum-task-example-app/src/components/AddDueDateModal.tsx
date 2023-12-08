import { Modal } from '@mantine/core';
import { getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';

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
      <QuestionnaireForm
        questionnaire={{
          resourceType: 'Questionnaire',
          id: 'due-date',
          title: 'Add a Due Date',
          item: [
            {
              linkId: 'due-date',
              text: 'Add a Due Date',
              type: 'date',
            },
          ],
        }}
        onSubmit={handleDueDateSubmit}
      />
    </Modal>
  );
}
