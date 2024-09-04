import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { List, MedicationKnowledge, Reference } from '@medplum/fhirtypes';
import { CodingInput, Document, SearchControl, useMedplum, useMedplumNavigate } from '@medplum/react';
import { IconCircle, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

export function MedicationsPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const [medications, setMedications] = useState<MedicationKnowledge[]>();
  const [formulary, setFormulary] = useState<List>();

  useEffect(() => {
    medplum.searchResources('MedicationKnowledge').then(setMedications).catch(console.error);
    medplum
      .searchOne('List', {
        identifier: `https://neutron.health|neutron-medication-catalog`,
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

  return (
    <Document>
      <Button onClick={syncFormulary}>Sync Formulary with Photon Health</Button>
      <CodingInput
        name="formulary-codes"
        binding="http://hl7.org/fhir/us/davinci-drug-formulary/ValueSet/SemanticDrugVS"
        path=""
      />
      <SearchControl
        search={{ resourceType: 'MedicationKnowledge', fields: ['ingredient', 'code'] }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar
      />
    </Document>
  );
}
