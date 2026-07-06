// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Group, Loader, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { CarePlan, Patient, PlanDefinition } from '@medplum/fhirtypes';
import { Document, ResourceInput, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

export function ProtocolsPage(): JSX.Element {
  const medplum = useMedplum();
  const [protocols, setProtocols] = useState<PlanDefinition[]>();
  const [selected, setSelected] = useState<PlanDefinition | undefined>();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [enrolling, setEnrolling] = useState(false);

  const loadProtocols = useCallback(() => {
    medplum
      .searchResources('PlanDefinition', '_count=100&_sort=title')
      .then(setProtocols)
      .catch((err) => {
        showNotification({ color: 'red', icon: <IconCircleOff />, title: 'Error', message: normalizeErrorString(err) });
        setProtocols([]);
      });
  }, [medplum]);

  useEffect(() => {
    loadProtocols();
  }, [loadProtocols]);

  const closeModal = (): void => {
    setSelected(undefined);
    setPatient(undefined);
  };

  const handleEnroll = async (): Promise<void> => {
    if (!selected || !patient) {
      showNotification({ color: 'yellow', title: 'Error', message: 'Please select a patient.' });
      return;
    }

    setEnrolling(true);
    try {
      const canonical = selected.url ?? `PlanDefinition/${selected.id}`;
      const carePlan: CarePlan = {
        resourceType: 'CarePlan',
        status: 'active',
        intent: 'plan',
        instantiatesCanonical: [canonical],
        subject: { reference: `Patient/${patient.id}` },
        title: selected.title,
      };
      await medplum.createResource(carePlan);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: `Patient enrolled in "${selected.title ?? 'protocol'}"`,
      });
      closeModal();
    } catch (err) {
      showNotification({ color: 'red', icon: <IconCircleOff />, title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <Document>
      <Title order={2} mb="md">
        Protocols
      </Title>
      <Text c="dimmed" mb="lg">
        Clinical protocols available for enrollment. Enroll a patient to create an active care plan.
      </Text>

      {!protocols ? (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      ) : protocols.length === 0 ? (
        <Text c="dimmed">No protocols found.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Title</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {protocols.map((protocol) => (
              <Table.Tr key={protocol.id}>
                <Table.Td>
                  <Text fw={500}>{protocol.title ?? protocol.name ?? '(untitled)'}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={protocol.status === 'active' ? 'green' : 'gray'} variant="light">
                    {protocol.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {protocol.description ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Button size="xs" variant="light" onClick={() => setSelected(protocol)}>
                    Enroll patient
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={!!selected}
        onClose={closeModal}
        title={`Enroll patient in "${selected?.title ?? 'protocol'}"`}
        styles={{ title: { fontWeight: 600 } }}
      >
        <Stack gap="md">
          <ResourceInput
            resourceType="Patient"
            name="enroll-patient"
            label="Patient"
            required={true}
            onChange={(value) => setPatient(value as Patient | undefined)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeModal} disabled={enrolling}>
              Cancel
            </Button>
            <Button onClick={handleEnroll} loading={enrolling} disabled={!patient || enrolling}>
              Enroll
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Document>
  );
}
