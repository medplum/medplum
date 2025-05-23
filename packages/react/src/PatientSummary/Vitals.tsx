import { Flex, Group, Modal, SimpleGrid, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatQuantity } from '@medplum/core';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { JSX, useCallback, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { CollapsibleSection } from './CollapsibleSection';
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

const BP = '85354-9';
const SYSTOLIC = '8480-6';
const DIASTOLIC = '8462-4';

const LOINC_CODES: ObservationMeta[] = [
  {
    name: 'systolic',
    short: 'BP Sys',
    code: BP,
    component: SYSTOLIC,
    title: 'Blood Pressure',
    unit: 'mm[Hg]',
  },
  {
    name: 'diastolic',
    short: 'BP Dias',
    code: BP,
    component: DIASTOLIC,
    title: 'Blood Pressure',
    unit: 'mm[Hg]',
  },
  {
    name: 'heartRate',
    short: 'HR',
    code: '8867-4',
    title: 'Heart Rate',
    unit: '/min',
  },
  {
    name: 'bodyTemperature',
    short: 'Temp',
    code: '8310-5',
    title: 'Body Temperature',
    unit: 'Cel',
  },
  {
    name: 'respiratoryRate',
    short: 'RR',
    code: '9279-1',
    title: 'Respiratory Rate',
    unit: '/min',
  },
  {
    name: 'height',
    short: 'Ht',
    code: '8302-2',
    title: 'Height',
    unit: 'cm',
  },
  {
    name: 'weight',
    short: 'Wt',
    code: '29463-7',
    title: 'Weight',
    unit: 'kg',
  },
  {
    name: 'bmi',
    short: 'BMI',
    code: '39156-5',
    title: 'BMI',
    unit: 'kg/m2',
  },
  {
    name: 'oxygen',
    short: 'O2',
    code: '2708-6',
    title: 'Oxygen',
    unit: '%',
  },
  {
    name: 'headCircumference',
    short: 'HC',
    code: '9843-4',
    title: 'Head Circumference',
    unit: 'cm',
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
            <Group key={meta.name} justify="flex-start" gap="md">
              <Tooltip label={meta.title}>
                <Text>
                  {meta.short} : {formatQuantity(getObservationValue(obs, meta.component))}
                </Text>
              </Tooltip>
            </Group>
          );
        })}
      </Flex>
    ) : (
      <Text>(none)</Text>
    );

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
