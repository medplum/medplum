import { Modal } from '@mantine/core';
import { QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';

interface UpdateStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpdateStatusModal(props: UpdateStatusModalProps): JSX.Element {
  const handleSubmit = (formData: QuestionnaireResponse) => {
    console.log(formData);
    props.onClose();
  };

  return (
    <Modal opened={props.isOpen} onClose={props.onClose}>
      <QuestionnaireForm
        questionnaire={{
          resourceType: 'Questionnaire',
          id: 'update-status-questionnaire',
          title: 'Update Status',
          item: [
            {
              linkId: 'update-status',
              text: 'Update Task Status',
              type: 'choice',
            },
          ],
        }}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}
