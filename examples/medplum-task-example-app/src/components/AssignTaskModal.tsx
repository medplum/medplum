import { filterProps, Modal } from '@mantine/core';
import { QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';

interface AssignTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AssignTaskModal(props: AssignTaskModalProps): JSX.Element {
  const handleQuestionnaireSubmit = (formData: QuestionnaireResponse) => {
    console.log(formData);
    props.onClose();
  };

  return (
    <Modal opened={props.isOpen} onClose={props.onClose}>
      <QuestionnaireForm
        questionnaire={{
          resourceType: 'Questionnaire',
          id: 'assign-questionnaire',
          title: 'Assign Owner to Task',
          item: [
            {
              linkId: 'owner',
              type: 'reference',
              text: 'Owner',
            },
          ],
        }}
        onSubmit={handleQuestionnaireSubmit}
      />
    </Modal>
  );
}
