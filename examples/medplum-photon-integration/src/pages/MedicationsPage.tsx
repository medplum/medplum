// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Flex, Modal, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { createReference, normalizeErrorString, PatchOperation } from '@medplum/core';
import { Coding, List, MedicationKnowledge, Resource } from '@medplum/fhirtypes';
import { CodingInput, Container, Document, ResourceForm, useMedplum } from '@medplum/react';
import { IconCircle, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX, useEffect, useState } from 'react';
import { FormularyDisplay } from '../components/FormularyDisplay';

export function MedicationsPage(): JSX.Element {
  const medplum = useMedplum();
  const [medications, setMedications] = useState<MedicationKnowledge[]>();
  const [formulary, setFormulary] = useState<List>();
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
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
      .then(setFormulary)
      .catch(console.error);
  }, [medplum, medications, formulary]);

  async function syncFormulary(): Promise<void> {
    setLoading(true);
    try {
      const result = (await medplum.executeBot(
        {
          system: 'https://neutron.health/bots',
          value: 'sync-formulary',
        },
        { ...formulary },
        'application/json'
      )) as MedicationKnowledge[];
      setLoading(false);

      if (result.length === 0) {
        notifications.show({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Your formulary has been synced with Photon',
        });
      } else {
        const unsyncedMeds = result.map((med) => med.code?.coding?.[0].display);
        notifications.show({
          icon: <IconCircle />,
          title: 'Partially Synced',
          message: `The following medications could not be synced: ${unsyncedMeds}`,
        });
      }
    } catch (err) {
      setLoading(false);
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  function handleSelectCoding(coding?: Coding): void {
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

  async function handleAddToFormulary(knowledge: Resource): Promise<void> {
    if (knowledge.resourceType !== 'MedicationKnowledge') {
      throw new Error('Invalid resource type');
    }

    try {
      const medication = await medplum.createResource(knowledge);
      if (formulary) {
        const formularyId = formulary.id as string;
        const medications = formulary.entry ?? [];
        medications.push({ item: createReference(medication) });
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
        <Title order={3}>Formulary Management</Title>
        <Button onClick={syncFormulary} loading={loading}>
          Sync Formulary
        </Button>
      </Flex>
      <Container m="md">
        <CodingInput
          name="medication-code"
          binding="http://hl7.org/fhir/us/davinci-drug-formulary/ValueSet/SemanticDrugVS"
          path=""
          onChange={handleSelectCoding}
          description="Add a medication to your formulary"
        />
      </Container>
      <FormularyDisplay formulary={formulary} />
      <Modal opened={opened} onClose={toggle}>
        <ResourceForm defaultValue={knowledge} onSubmit={handleAddToFormulary} />
      </Modal>
    </Document>
  );
}
