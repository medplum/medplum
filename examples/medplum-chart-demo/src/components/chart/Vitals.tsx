import { Anchor, Button, Grid, Group, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { generateId } from '@medplum/core';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { Form, QuantityDisplay, useMedplum } from '@medplum/react';
import { useCallback, useState } from 'react';
import {
  createCompoundObservation,
  createLoincCode,
  createObservation,
  createQuantity,
  getCompoundObservationValue,
  getObservationValue,
} from './Vitals.utils';

interface ObservationMeta {
  code: string;
  title: string;
  unit: string;
}

const LOINC: Record<string, ObservationMeta> = {
  bloodPressure: {
    code: '85354-9',
    title: 'Blood Pressure',
    unit: 'mm[Hg]',
  },
  heartRate: {
    code: '8867-4',
    title: 'Heart Rate',
    unit: '/min',
  },
  bodyTemperature: {
    code: '8310-5',
    title: 'Body Temperature',
    unit: 'Cel',
  },
  respiratoryRate: {
    code: '9279-1',
    title: 'Respiratory Rate',
    unit: '/min',
  },
  height: {
    code: '8302-2',
    title: 'height',
    unit: 'cm',
  },
  weight: {
    code: '29463-7',
    title: 'weight',
    unit: 'kg',
  },
  bmi: {
    code: '39156-5',
    title: 'BMI',
    unit: 'kg/m2',
  },
  oxygen: {
    code: '2708-6',
    title: 'Oxygen',
    unit: '%',
  },
  headCircumference: {
    code: '9843-4',
    title: 'Head Circumference',
    unit: 'cm',
  },
};

const SYSTOLIC = '8480-6';
const DIASTOLIC = '8462-4';

export interface VitalsProps {
  patient: Patient;
  encounter?: Encounter;
  vitals: Observation[];
}

export function Vitals(props: VitalsProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [vitals, setVitals] = useState<Observation[]>(props.vitals);
  const [opened, { open, close }] = useDisclosure(false);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      const newAllergy: Observation = {
        resourceType: 'Observation',
        id: generateId(),
        code: { coding: [{ code: formData.allergy, display: formData.allergy }] },
      };

      Promise.allSettled(
        Object.entries(LOINC).map(([name, meta]) => {
          if (name === 'bloodPressure') {
            return medplum.createResource<Observation>(
              createCompoundObservation(patient, encounter, meta.code, meta.title, [
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
          }
          return medplum.createResource<Observation>(
            createObservation(
              patient,
              encounter,
              meta.code,
              meta.title,
              createQuantity(parseFloat(formData[name]), meta.unit)
            )
          );
        })
      )
        .then((result) => {
          console.log('result', result);
        })
        .catch(console.error);

      setVitals([...vitals, newAllergy]);
      close();
    },
    [medplum, patient, encounter, vitals, close]
  );

  return (
    <>
      <Group position="apart">
        <Text fz="md" fw={700}>
          Vitals
        </Text>
        <Anchor href="#" onClick={open}>
          + Add
        </Anchor>
      </Group>
      <Grid>
        <Grid.Col span={3} ta="right" c="dimmed">
          BP Sys
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getCompoundObservationValue(vitals, LOINC.bloodPressure.code, SYSTOLIC)} />
        </Grid.Col>
        <Grid.Col span={3} ta="right" c="dimmed">
          BP Dias
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getCompoundObservationValue(vitals, LOINC.bloodPressure.code, DIASTOLIC)} />
        </Grid.Col>
        <Grid.Col span={3} ta="right" c="dimmed">
          HR
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getObservationValue(vitals, LOINC.heartRate.code)} />
        </Grid.Col>
        <Grid.Col span={3} ta="right" c="dimmed">
          Temp
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getObservationValue(vitals, LOINC.bodyTemperature.code)} />
        </Grid.Col>
        <Grid.Col span={3} ta="right" c="dimmed">
          RR
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getObservationValue(vitals, LOINC.respiratoryRate.code)} />
        </Grid.Col>
        <Grid.Col span={3} ta="right" c="dimmed">
          Height
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getObservationValue(vitals, LOINC.height.code)} />
        </Grid.Col>
        <Grid.Col span={3} ta="right" c="dimmed">
          Weight
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getObservationValue(vitals, LOINC.weight.code)} />
        </Grid.Col>
        <Grid.Col span={3} ta="right" c="dimmed">
          BMI
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getObservationValue(vitals, LOINC.bmi.code)} />
        </Grid.Col>
        <Grid.Col span={3} ta="right" c="dimmed">
          O2
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getObservationValue(vitals, LOINC.oxygen.code)} />
        </Grid.Col>
        <Grid.Col span={3} ta="right" c="dimmed">
          HC
        </Grid.Col>
        <Grid.Col span={3}>
          <QuantityDisplay value={getObservationValue(vitals, LOINC.headCircumference.code)} />
        </Grid.Col>
      </Grid>
      <Modal opened={opened} onClose={close} title="Add Vitals">
        <Form onSubmit={handleSubmit}>
          <Stack>
            <Group grow>
              <TextInput name="systolic" label="BP Sys" data-autofocus={true} autoFocus />
              <TextInput name="diastolic" label="BP Dias" />
            </Group>
            <Group grow>
              <TextInput name="heartRate" label="HR" />
              <TextInput name="bodyTemperature" label="Temp" />
            </Group>
            <Group grow>
              <TextInput name="respiratoryRate" label="RR" />
              <TextInput name="height" label="height" />
            </Group>
            <Group grow>
              <TextInput name="weight" label="Wt" />
              <TextInput name="bmi" label="BMI" />
            </Group>
            <Group grow>
              <TextInput name="oxygen" label="O2" />
              <TextInput name="headCircumference" label="HC" />
            </Group>
            <Textarea name="notes" label="Notes" />
          </Stack>
          <Group position="right" spacing={4} mt="md">
            <Button type="submit">Save</Button>
          </Group>
        </Form>
      </Modal>
    </>
  );
}
