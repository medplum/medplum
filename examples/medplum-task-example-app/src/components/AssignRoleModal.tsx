import { Modal } from '@mantine/core';
import { CodeableConcept } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';

interface AssignRoleModalProps {
  onAssignRole: (role: CodeableConcept) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function AssignRoleModal({ onAssignRole, isOpen, onClose }: AssignRoleModalProps): JSX.Element {
  const handleAssignRoleQuestionnaireSubmit = () => {};
  return (
    <Modal opened={isOpen} onClose={onClose}>
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
              answerValueSet: 'https://example-business.org',
            },
          ],
        }}
        onSubmit={handleAssignRoleQuestionnaireSubmit}
      />
    </Modal>
  );
}
