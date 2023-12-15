import { Modal } from '@mantine/core';
import { getQuestionnaireAnswers } from '@medplum/core';
import { Coding, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';
import { updateStatusQuestionnaire } from '../../../data/questionnaires';

interface UpdateStatusModalProps {
  onUpdateStatus: (status: Coding) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function UpdateStatusModal(props: UpdateStatusModalProps): JSX.Element {
  const handleStatusUpdate = (formData: QuestionnaireResponse): void => {
    const status = getQuestionnaireAnswers(formData)['update-status'].valueCoding;

    if (status) {
      props.onUpdateStatus(status);
    }

    props.onClose();
  };

  return (
    <Modal opened={props.isOpen} onClose={props.onClose}>
      <QuestionnaireForm questionnaire={updateStatusQuestionnaire} onSubmit={handleStatusUpdate} />
    </Modal>
  );
}
