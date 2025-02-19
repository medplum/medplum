import { Anchor, Button, Grid, Group, Modal, SimpleGrid, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatQuantity } from '@medplum/core';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { Fragment, useCallback, useState } from 'react';
import { Form } from '../Form/Form';
import { killEvent } from '../utils/dom';
import { ConceptBadge } from './ConceptBadge';
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
  const { patient, encounter } = props;
  const [vitals, setVitals] = useState<Observation[]>(props.vitals);
  const [opened, { open, close }] = useDisclosure(false);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      const newObservations = [];

      // Blood pressure is special because it has two components
      newObservations.push(
        createCompoundObservation(patient, encounter, BP, 'Blood pressure', [
          {
            code: createLoincCode(SYSTOLIC, 'Systolic blood pressure'),
            valueQuantity: createQuantity(parseFloat(formData['systolic']), 'mm[Hg]'),
          },
          {
            code: createLoincCode(DIASTOLIC, 'Diastolic blood pressure'),
            valueQuantity: createQuantity(parseFloat(formData['diastolic']), 'mm[Hg]'),
          },
        ])
      );

      for (const meta of LOINC_CODES) {
        if (meta.component) {
          continue;
        }
        newObservations.push(
          createObservation(
            patient,
            encounter,
            meta.code,
            meta.title,
            createQuantity(parseFloat(formData[meta.name]), meta.unit)
          )
        );
      }

      // Execute all create requests in parallel to take advantage of autobatching
      Promise.all(newObservations.filter(Boolean).map((obs) => medplum.createResource<Observation>(obs as Observation)))
        .then((newVitals) => setVitals([...newVitals, ...vitals]))
        .catch(console.error);

      close();
    },
    [medplum, patient, encounter, vitals, close]
  );

  return (
    <>
      <Group justify="space-between">
        <Text fz="md" fw={700}>
          Vitals
        </Text>
        <Anchor
          href="#"
          onClick={(e) => {
            killEvent(e);
            open();
          }}
        >
          + Add
        </Anchor>
      </Group>
      <Grid>
        {LOINC_CODES.map((meta) => {
          const obs = vitals.find((o) => o.code?.coding?.[0].code === meta.code);
          return (
            <Fragment key={meta.name}>
              <Grid.Col span={2} ta="right">
                <Tooltip label={meta.title}>
                  <Text c="dimmed" size="xs">
                    {meta.short}
                  </Text>
                </Tooltip>
              </Grid.Col>
              <Grid.Col span={4}>
                <Text size="xs">
                  {obs && (
                    <ConceptBadge<Observation>
                      key={meta.name}
                      resource={obs}
                      display={formatQuantity(getObservationValue(obs, meta.component))}
                      onClick={props.onClickResource}
                    />
                  )}
                </Text>
              </Grid.Col>
            </Fragment>
          );
        })}
      </Grid>
      <Modal opened={opened} onClose={close} title="Add Vitals">
        <Form onSubmit={handleSubmit}>
          <SimpleGrid cols={2}>
            {LOINC_CODES.map((meta, index) => (
              <TextInput
                key={meta.name}
                name={meta.name}
                label={meta.short}
                description={meta.title}
                data-autofocus={index === 0}
                autoFocus={index === 0}
              />
            ))}
          </SimpleGrid>
          <Textarea name="notes" label="Notes" />
          <Group justify="flex-end" gap={4} mt="md">
            <Button type="submit">Save</Button>
          </Group>
        </Form>
      </Modal>
    </>
  );
}
