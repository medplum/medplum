import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getQuestionnaireAnswers, normalizeErrorString, PatchOperation } from '@medplum/core';
import { Communication, Patient, Questionnaire, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface AddSubjectProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function AddSubject(props: AddSubjectProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, handlers] = useDisclosure(false);

  function onQuestionnaireSubmit(formData: QuestionnaireResponse): void {
    // Throw an error if there is already a subject on the thread
    if (props.communication.subject) {
      throw new Error('Thread already has a subject.');
    }
    const subjectData = getQuestionnaireAnswers(formData)['add-subject'].valueReference as Reference<Patient>;
    if (!subjectData) {
      throw new Error('Invalid subject');
    }
    addSubjectToThread(subjectData).catch(console.error);
    handlers.close();
  }

  async function addSubjectToThread(subjectData: Reference<Patient>): Promise<void> {
    const communicationId = props.communication.id as string;
    const ops: PatchOperation[] = [
      // Test to prevent race conditions
      { op: 'test', path: '/meta/versionId', value: props.communication.meta?.versionId },
      // Patch the new subject to the thread's subject path
      { op: 'add', path: '/subject', value: subjectData },
    ];

    try {
      const result = await medplum.patchResource('Communication', communicationId, ops);
      props.onChange(result);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Subject added',
      });
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  return (
    <div>
      <Button onClick={handlers.open} fullWidth>
        Add a Subject
      </Button>
      <Modal opened={opened} onClose={handlers.close}>
        <QuestionnaireForm questionnaire={addSubjectQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const addSubjectQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'add-subject',
  item: [
    {
      linkId: 'add-subject',
      type: 'reference',
      text: 'Add a subject to the thread',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: {
            coding: [
              {
                code: 'Patient',
              },
            ],
          },
        },
      ],
    },
  ],
};
