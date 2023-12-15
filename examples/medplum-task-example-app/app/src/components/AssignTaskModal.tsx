import { Modal } from '@mantine/core';
import { getQuestionnaireAnswers } from '@medplum/core';
import { QuestionnaireResponse, Reference, Resource } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';
import { assignTaskQuestionnaire } from '../data/questionnaires';

interface AssignTaskModalProps {
  onAssign: (owner: Reference<Resource>) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function AssignTaskModal(props: AssignTaskModalProps): JSX.Element {
  const handleQuestionnaireSubmit = (formData: QuestionnaireResponse) => {
    const answer = getQuestionnaireAnswers(formData)['owner'].valueReference;

    if (answer) {
      props.onAssign(answer);
    }

    props.onClose();
  };

  return (
    <Modal opened={props.isOpen} onClose={props.onClose}>
      <QuestionnaireForm questionnaire={assignTaskQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
  );
}
