import { Alert, Box, Button, Group, Modal, NumberInput, Stack, Table, Title } from '@mantine/core';
import { createReference, formatDate, formatDateTime, formatObservationValue, getReferenceString } from '@medplum/core';
import { Observation, ObservationComponent, Patient } from '@medplum/fhirtypes';
import { Document, Form, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { ChartData, ChartDataset } from 'chart.js';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart } from '../../components/LineChart';
import { measurementsMeta } from './Measurement.data';

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

    medplum
      .createResource(obs)
      .then(() => setModalOpen(false))
      .catch(console.error);
  }

  return (
    <Document>
      <Group justify="space-between" mb="xl">
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
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Your Value</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {observations.map((obs) => (
              <Table.Tr key={obs.id}>
                <Table.Td>{formatDateTime(obs.effectiveDateTime as string)}</Table.Td>
                <Table.Td>{formatObservationValue(obs)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Modal size="lg" opened={modalOpen} onClose={() => setModalOpen(false)} title={title}>
        <Form onSubmit={addObservation}>
          <Stack gap="md">
            <Group grow wrap="nowrap">
              {chartDatasets.map((component) => (
                <NumberInput key={component.label} label={component.label} name={component.label} />
              ))}
            </Group>
            <Group justify="flex-end">
              <Button type="submit">Add</Button>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </Document>
  );
}
