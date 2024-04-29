import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getQuestionnaireAnswers, PatchOperation } from '@medplum/core';
import { CodeableConcept, Coding, Encounter, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';

interface EditTypeProps {
  encounter: Encounter;
  onChange: (encounter: Encounter) => void;
}

export function EditType(props: EditTypeProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, handlers] = useDisclosure(false);

  function handleQuestionnaireSubmit(formData: QuestionnaireResponse): void {
    const type = getQuestionnaireAnswers(formData)['type'].valueCoding;
    updateEncounterType(type);

    handlers.close();
  }

  function updateEncounterType(type?: Coding): void {
    if (!type) {
      throw new Error('Invalid type');
    }
    const encounterId = props.encounter.id as string;
    const typeConcept: CodeableConcept = {
      coding: [type],
    };

    const op = props.encounter.type ? 'replace' : 'add';
    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: props.encounter.meta?.versionId },
      { op, path: '/type', value: [typeConcept] },
    ];

    medplum.patchResource('Encounter', encounterId, ops).then(props.onChange).catch(console.error);
  }

  return (
    <div>
      <Button fullWidth onClick={handlers.open}>
        Edit Type
      </Button>
      <Modal opened={opened} onClose={handlers.close}>
        <QuestionnaireForm questionnaire={editTypeQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const editTypeQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'edit-type',
  title: 'Edit Encounter Type',
  item: [
    {
      linkId: 'type',
      type: 'choice',
      text: 'New Type:',
      answerValueSet: 'http://hl7.org/fhir/ValueSet/encounter-type',
    },
  ],
};
