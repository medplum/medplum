import { Button, Flex, Modal, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString, PatchOperation } from '@medplum/core';
import { Coding, List, MedicationKnowledge, Questionnaire, Resource } from '@medplum/fhirtypes';
import { CodingInput, Document, ResourceForm, useMedplum } from '@medplum/react';
import { IconCircle, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { FormularyDisplay } from '../components/FormularyDisplay';

export function MedicationsPage(): JSX.Element {
  const medplum = useMedplum();
  const [medications, setMedications] = useState<MedicationKnowledge[]>();
  const [formulary, setFormulary] = useState<List>();
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const [knowledge, setKnowledge] = useState<MedicationKnowledge>({
    resourceType: 'MedicationKnowledge',
    status: 'active',
  });

  useEffect(() => {
    medplum.searchResources('MedicationKnowledge').then(setMedications).catch(console.error);
    medplum
      .searchOne('List', {
        code: 'formulary',
      })
      .then(setFormulary);
  }, [medplum, medications, formulary]);

  async function syncFormulary() {
    try {
      const result = (await medplum.executeBot(
        {
          system: 'https://neutron.health/bots',
          value: 'sync-formulary',
        },
        { ...formulary },
        'application/json'
      )) as MedicationKnowledge[];

      if (result.length === 0) {
        notifications.show({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Your formulary has been synced with Photon',
        });
      } else {
        notifications.show({
          icon: <IconCircle />,
          title: 'Partially Synced',
          message:
            'Some medications could not be synced. For a full list of unsynced medications, see the sync formulary bot audit events.',
        });
      }
    } catch (err) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  function handleSelectCoding(coding?: Coding) {
    if (!coding) {
      return;
    }
    const medicationKnowledge: MedicationKnowledge = {
      ...knowledge,
      code: { coding: [coding] },
    };
    setKnowledge(medicationKnowledge);
    open();
  }

  async function handleAddToFormulary(knowledge: Resource) {
    if (knowledge.resourceType !== 'MedicationKnowledge') {
      throw new Error('Invalid resource type');
    }

    try {
      const medication = await medplum.createResource(knowledge);
      if (formulary) {
        const formularyId = formulary.id as string;
        const medications = formulary.entry ?? [];
        medications.push({ item: { reference: getReferenceString(medication) } });
        const ops: PatchOperation[] = [{ op: 'add', path: '/entry', value: medications }];

        const updatedFormulary = await medplum.patchResource('List', formularyId, ops);
        setFormulary(updatedFormulary);
        close();
        notifications.show({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Added to formulary',
        });
      }
    } catch (err) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  return (
    <Document>
      <Flex justify="space-between" mb="md">
        <Title>Formulary Management</Title>
        <CodingInput
          name="medication-code"
          binding="http://hl7.org/fhir/us/davinci-drug-formulary/ValueSet/SemanticDrugVS"
          path=""
          onChange={handleSelectCoding}
          description="Add a medication to your formulary"
          width="fit-content"
        />
        <Button onClick={syncFormulary}>Sync Formulary</Button>
      </Flex>
      <FormularyDisplay formulary={formulary} />
      <Modal opened={opened} onClose={toggle}>
        <ResourceForm defaultValue={knowledge} onSubmit={handleAddToFormulary} />
      </Modal>
    </Document>
  );
}

const medicationKnowledgeQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Add Medication to Formulary',
  name: 'add-to-formulary',
  item: [
    {
      linkId: 'medication',
      type: 'choice',
      answerValueSet: 'http://hl7.org/fhir/us/davinci-drug-formulary/ValueSet/SemanticDrugVS',
      text: 'Select a medication',
    },
  ],
};
