import { Modal } from '@mantine/core';
import { getQuestionnaireAnswers } from '@medplum/core';
import { Coding, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';

interface UpdateStatusModalProps {
  onUpdateStatus: (status: Coding) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function UpdateStatusModal(props: UpdateStatusModalProps): JSX.Element {
  const handleStatusUpdate = (formData: QuestionnaireResponse) => {
    const status = getQuestionnaireAnswers(formData)['update-status'].valueCoding;

    if (status) {
      props.onUpdateStatus(status);
    }

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
              answerValueSet: 'http://hl7.org/fhir/ValueSet/task-status',
            },
          ],
        }}
        onSubmit={handleStatusUpdate}
      />
    </Modal>
  );
}
