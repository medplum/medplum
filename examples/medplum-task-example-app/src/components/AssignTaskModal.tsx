import { Modal } from '@mantine/core';
import { getQuestionnaireAnswers } from '@medplum/core';
import { QuestionnaireResponse, Reference, Resource } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';

interface AssignTaskModalProps {
  onAssign: (owner: Reference<Resource>) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function AssignTaskModal(props: AssignTaskModalProps): JSX.Element {
  const handleQuestionnaireSubmit = (formData: QuestionnaireResponse) => {
    const answer = getQuestionnaireAnswers(formData)['ower'].valueReference;

    if (answer) {
      props.onAssign(answer);
    }

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
