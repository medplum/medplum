import { ActionIcon, Box, Flex, Group, Modal, SimpleGrid, Text, TextInput, Textarea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, formatQuantity } from '@medplum/core';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronRight } from '@tabler/icons-react';
import { JSX, useCallback, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { CollapsibleSection } from './CollapsibleSection'; // Import the new component
import styles from './PatientSummary.module.css';
import {
  createCompoundObservation,
  createLoincCode,
  createObservation,
  createQuantity,
  getObservationValue,
} from './Vitals.utils';

interface ObservationMeta {
  readonly name: string;
  readonly short: string;
  readonly code: string;
  readonly component?: string;
  readonly title: string;
  readonly unit: string;
}

const LOINC_CODES: ObservationMeta[] = [
  {
    name: 'systolic',
    short: 'Systolic',
    code: '8480-6',
    title: 'Systolic blood pressure',
    unit: 'mm[Hg]',
  },
  {
    name: 'diastolic',
    short: 'Diastolic',
    code: '8462-4',
    title: 'Diastolic blood pressure',
    unit: 'mm[Hg]',
  },
  {
    name: 'pulse',
    short: 'Pulse',
    code: '8867-4',
    title: 'Heart rate',
    unit: '/min',
  },
  {
    name: 'temperature',
    short: 'Temp',
    code: '8310-5',
    title: 'Body temperature',
    unit: 'Cel',
  },
  {
    name: 'respiratory',
    short: 'Resp',
    code: '9279-1',
    title: 'Respiratory rate',
    unit: '/min',
  },
  {
    name: 'oxygen',
    short: 'O2',
    code: '2708-6',
    title: 'Oxygen saturation in Arterial blood',
    unit: '%',
  },
  {
    name: 'height',
    short: 'Height',
    code: '8302-2',
    title: 'Body height',
    unit: 'cm',
  },
  {
    name: 'weight',
    short: 'Weight',
    code: '29463-7',
    title: 'Body weight',
    unit: 'kg',
  },
  {
    name: 'bmi',
    short: 'BMI',
    code: '39156-5',
    title: 'Body mass index (BMI) [Ratio]',
    unit: 'kg/m2',
  },
];

export interface VitalsProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly vitals: Observation[];
  readonly onClickResource?: (resource: Observation) => void;
}

export function Vitals(props: VitalsProps): JSX.Element {
  const medplum = useMedplum();
  const [vitals, setVitals] = useState<Observation[]>(props.vitals);
  const [opened, { open, close }] = useDisclosure(false);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      const observations: Observation[] = [];

      // Handle blood pressure as a compound observation
      if (formData.systolic || formData.diastolic) {
        const bpObs = createCompoundObservation(props.patient, props.encounter, 'blood-pressure', 'Blood pressure', [
          {
            code: createLoincCode('8480-6', 'Systolic blood pressure'),
            valueQuantity: createQuantity(parseFloat(formData.systolic), 'mm[Hg]'),
          },
          {
            code: createLoincCode('8462-4', 'Diastolic blood pressure'),
            valueQuantity: createQuantity(parseFloat(formData.diastolic), 'mm[Hg]'),
          },
        ]);
        if (bpObs) {
          observations.push(bpObs);
        }
      }

      // Handle all other vitals as individual observations
      LOINC_CODES.filter((meta) => meta.name !== 'systolic' && meta.name !== 'diastolic').forEach((meta) => {
        const value = formData[meta.name];
        if (value) {
          const obs = createObservation(
            props.patient,
            props.encounter,
            meta.code,
            meta.title,
            createQuantity(parseFloat(value), meta.unit)
          );
          if (obs) {
            observations.push(obs);
          }
        }
      });

      Promise.all(observations.map((obs) => medplum.createResource(obs)))
        .then((newVitals) => {
          setVitals([...vitals, ...newVitals]);
          close();
        })
        .catch(console.error);
    },
    [medplum, props.patient, props.encounter, vitals, close]
  );

  const vitalsContent =
    vitals.length > 0 ? (
      <Flex direction="column" gap={8}>
        {LOINC_CODES.map((meta) => {
          const obs = vitals.find((o) => o.code?.coding?.[0].code === meta.code);
          if (!obs) {
            return null;
          }

          return (
            <Box key={meta.code} className={styles.patientSummaryListItem}>
              <Box style={{ position: 'relative' }}>
                <Text size="sm" fw={500} style={{ cursor: 'pointer' }}>
                  {meta.short}:
                </Text>
                <Text size="sm">{formatQuantity(getObservationValue(obs, meta.component))}</Text>
                {obs?.effectiveDateTime && (
                  <>
                    <Text size="xs" fw={500} color="gray.6" ml={2}>
                      {formatDate(obs.effectiveDateTime)}
                    </Text>
                    <div className={styles.patientSummaryGradient} />
                    <div className={styles.patientSummaryChevronContainer}>
                      <ActionIcon
                        className={styles.patientSummaryChevron}
                        size="md"
                        variant="transparent"
                        tabIndex={-1}
                      >
                        <IconChevronRight size={16} stroke={2.5} />
                      </ActionIcon>
                    </div>
                  </>
                )}
              </Box>
            </Box>
          );
        })}
      </Flex>
    ) : null;

  return (
    <>
      <CollapsibleSection title="Vitals" onAdd={open}>
        {vitalsContent}
      </CollapsibleSection>

      <Modal opened={opened} onClose={close} title="Add Vitals">
        <Form onSubmit={handleSubmit}>
          <SimpleGrid cols={2}>
            {LOINC_CODES.map((meta, index) => (
              <TextInput
                key={meta.name}
                name={meta.name}
                label={meta.short}
                description={`${meta.title} (${meta.unit})`}
                data-autofocus={index === 0}
                autoFocus={index === 0}
              />
            ))}
          </SimpleGrid>
          <Textarea name="notes" label="Notes" />
          <Group justify="flex-end" gap={4} mt="md">
            <SubmitButton>Save</SubmitButton>
          </Group>
        </Form>
      </Modal>
    </>
  );
}
