import { Alert, Box, Button, Group, Modal, NumberInput, Stack, Table, Title } from '@mantine/core';
import { createReference, formatDate, formatDateTime, formatObservationValue, getReferenceString } from '@medplum/core';
import { Observation, ObservationComponent, Patient } from '@medplum/fhirtypes';
import { Document, Form, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { ChartData, ChartDataset } from 'chart.js';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart } from '../../components/LineChart';

interface ObservationType {
  id: string;
  code: string;
  title: string;
  description: string;
  chartDatasets: {
    label: string;
    code?: string;
    unit: string;
    backgroundColor: string;
    borderColor: string;
  }[];
}

export const backgroundColor = 'rgba(29, 112, 214, 0.7)';
export const borderColor = 'rgba(29, 112, 214, 1)';
export const secondBackgroundColor = 'rgba(255, 119, 0, 0.7)';
export const secondBorderColor = 'rgba(255, 119, 0, 1)';

export const measurementsMeta: Record<string, ObservationType> = {
  'blood-pressure': {
    id: 'blood-pressure',
    code: '85354-9',
    title: 'Blood Pressure',
    description:
      'Your blood pressure is the pressure exerted on the walls of your blood vessels. When this pressure is high, it can damage your blood vessels and increase your risk for a heart attack or stroke. We measure your blood pressure periodically to make sure it is not staying high. Hypertention is a condition that refers to consistantly high blood pressure.',
    chartDatasets: [
      {
        label: 'Diastolic',
        code: '8462-4',
        unit: 'mm[Hg]',
        backgroundColor: secondBackgroundColor,
        borderColor: secondBorderColor,
      },
      {
        label: 'Systolic',
        code: '8480-6',
        unit: 'mm[Hg]',
        backgroundColor,
        borderColor,
      },
    ],
  },
  'body-temperature': {
    id: 'body-temperature',
    code: '8310-5',
    title: 'Body Temperature',
    description: 'Your body temperature values',
    chartDatasets: [
      {
        label: 'Body Temperature',
        unit: 'C',
        backgroundColor,
        borderColor,
      },
    ],
  },
  height: {
    id: 'height',
    code: '8302-2',
    title: 'Height',
    description: 'Your height values',
    chartDatasets: [
      {
        label: 'Height',
        unit: 'in',
        backgroundColor,
        borderColor,
      },
    ],
  },
  'respiratory-rate': {
    id: 'respiratory-rate',
    code: '9279-1',
    title: 'Respiratory Rate',
    description: 'Your respiratory rate values',
    chartDatasets: [
      {
        label: 'Respiratory Rate',
        unit: 'breaths/minute',
        backgroundColor,
        borderColor,
      },
    ],
  },
  'heart-rate': {
    id: 'heart-rate',
    code: '8867-4',
    title: 'Heart Rate',
    description: 'Your heart rate values',
    chartDatasets: [
      {
        label: 'Heart Rate',
        unit: 'beats/minute',
        backgroundColor,
        borderColor,
      },
    ],
  },
  weight: {
    id: 'weight',
    code: '29463-7',
    title: 'Weight',
    description: 'Your weight values',
    chartDatasets: [
      {
        label: 'Weight',
        unit: 'lbs',
        backgroundColor,
        borderColor,
      },
    ],
  },
};

export function Measurement(): JSX.Element | null {
  const { measurementId } = useParams();
  const { code, title, description, chartDatasets } = measurementsMeta[measurementId as string];
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [chartData, setChartData] = useState<ChartData<'line', number[]>>();

  const observations = medplum
    .searchResources('Observation', `code=${code}&patient=${getReferenceString(patient)}`)
    .read();

  useEffect(() => {
    if (observations) {
      const labels: string[] = [];
      const datasets: ChartDataset<'line', number[]>[] = chartDatasets.map((item) => ({ ...item, data: [] }));
      for (const obs of observations) {
        labels.push(formatDate(obs.effectiveDateTime));
        if (chartDatasets.length === 1) {
          datasets[0].data.push(obs.valueQuantity?.value as number);
        } else {
          for (let i = 0; i < chartDatasets.length; i++) {
            datasets[i].data.push((obs.component as ObservationComponent[])[i].valueQuantity?.value as number);
          }
        }
      }
      setChartData({ labels, datasets });
    }
  }, [chartDatasets, observations]);

  function addObservation(formData: Record<string, string>): void {
    console.log(formData);

    const obs: Observation = {
      resourceType: 'Observation',
      status: 'preliminary',
      subject: createReference(patient),
      effectiveDateTime: new Date().toISOString(),
      code: {
        coding: [
          {
            code,
            display: title,
            system: 'http://loinc.org',
          },
        ],
        text: title,
      },
    };

    if (chartDatasets.length === 1) {
      obs.valueQuantity = {
        value: parseFloat(formData[chartDatasets[0].label]),
        system: 'http://unitsofmeasure.org',
        unit: chartDatasets[0].unit,
        code: chartDatasets[0].unit,
      };
    } else {
      obs.component = chartDatasets.map((item) => ({
        code: {
          coding: [
            {
              code: '8462-4',
              display: 'Diastolic Blood Pressure',
              system: 'http://loinc.org',
            },
          ],
          text: item.label,
        },
        valueQuantity: {
          value: parseFloat(formData[item.label]),
          system: 'http://unitsofmeasure.org',
          unit: item.unit,
          code: item.unit,
        },
      }));
    }

    medplum.createResource(obs).then(() => setModalOpen(false));
  }

  return (
    <Document>
      <Group position="apart" mb="xl">
        <Title order={1}>{title}</Title>
        <Button onClick={() => setModalOpen(true)}>Add Measurement</Button>
      </Group>
      {chartData && <LineChart chartData={chartData} />}
      <Box my="xl">
        <Alert icon={<IconAlertCircle size={16} />} title="What is this measurement?" color="gray" radius="md">
          {description}
        </Alert>
      </Box>
      {observations?.length && (
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Your Value</th>
            </tr>
          </thead>
          <tbody>
            {observations.map((obs) => (
              <tr key={obs.id}>
                <td>{formatDateTime(obs.effectiveDateTime as string)}</td>
                <td>{formatObservationValue(obs)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Modal size="lg" opened={modalOpen} onClose={() => setModalOpen(false)} title={title}>
        <Form onSubmit={addObservation}>
          <Stack spacing="md">
            <Group grow noWrap>
              {chartDatasets.map((component) => (
                <NumberInput key={component.label} label={component.label} name={component.label} />
              ))}
            </Group>
            <Group position="right">
              <Button type="submit">Add</Button>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </Document>
  );
}
