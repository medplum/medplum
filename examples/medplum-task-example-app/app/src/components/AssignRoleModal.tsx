import { Modal } from '@mantine/core';
import { CodeableConcept } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';

interface AssignRoleModalProps {
  onAssignRole: (role: CodeableConcept) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function AssignRoleModal(props: AssignRoleModalProps): JSX.Element {
  const handleAssignRoleQuestionnaireSubmit = () => {};
  return (
    <Modal opened={props.isOpen} onClose={props.onClose}>
      <QuestionnaireForm
        questionnaire={{
          resourceType: 'Questionnaire',
          id: 'assign-role',
          title: 'Assign to a Role',
          item: [
            {
              linkId: 'assign-role',
              text: 'Select Role',
              type: 'choice',
              answerValueSet: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1099.30',
            },
          ],
        }}
        onSubmit={handleAssignRoleQuestionnaireSubmit}
      />
    </Modal>
  );
}
