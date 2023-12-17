import { Button, Modal } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { useState } from 'react';

interface AssignTaskProps {
  task: Task;
  onChange: () => void;
}

export function AssignRole(props: AssignTaskProps): JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const medplum = useMedplum();

  const handleOpenClose = (): void => {
    setIsOpen(!isOpen);
  };

  const onQuestionnaireSubmit = (): void => {};

  return (
    <div>
      <Button onClick={handleOpenClose}>Assign to a Role</Button>
      <Modal opened={isOpen} onClose={handleOpenClose}>
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
          onSubmit={onQuestionnaireSubmit}
        />
      </Modal>
    </div>
  );
}
