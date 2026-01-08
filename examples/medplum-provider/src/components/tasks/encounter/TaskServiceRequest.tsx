// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DiagnosticReport, Encounter, Reference, ServiceRequest, Task } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { IconPlus } from '@tabler/icons-react';
import { OrderLabsPage } from '../../../pages/labs/OrderLabsPage';
import type { LabOrganization, TestCoding } from '@medplum/health-gorilla-core';
import { showErrorNotification } from '../../../utils/notifications';

interface TaskServiceRequestProps {
  task: Task;
  saveDiagnosticReport: (diagnosticReport: DiagnosticReport) => void;
}

const SNOMED_SYSTEM = 'http://snomed.info/sct';
const SNOMED_DIAGNOSTIC_REPORT_CODE = '108252007';

export const TaskServiceRequest = (props: TaskServiceRequestProps): JSX.Element => {
  const { task } = props;
  const medplum = useMedplum();
  const serviceRequest = useResource(task.focus as Reference<ServiceRequest>);
  const [newOrderModalOpened, setNewOrderModalOpened] = useState(false);
  const [labServiceRequest, setLabServiceRequest] = useState<ServiceRequest | undefined>(undefined);
  const performingLab: LabOrganization = {
    resourceType: 'Organization',
    id: '258a1dbb-ccec-4cb3-b9ff-4dc28f8f28a0',
    name: 'HGDX LabCorp',
    identifier: [
      {
        system: 'https://www.healthgorilla.com',
        value: 'f-388554647b89801ea5e8320b',
      },
    ],
  };

  const tests: TestCoding[] | undefined = serviceRequest?.code?.coding
    ?.filter((coding) => coding.system === SNOMED_SYSTEM && coding.code !== SNOMED_DIAGNOSTIC_REPORT_CODE)
    .map((coding) => ({
      system: 'urn:uuid:f:388554647b89801ea5e8320b',
      code: coding.code,
      display: coding.display,
    })) as TestCoding[];

  useEffect(() => {
    const fetchServiceRequest = async (): Promise<void> => {
      const serviceRequest = await medplum.readReference(task.focus as Reference<ServiceRequest>);
      setLabServiceRequest(serviceRequest);
    };
    fetchServiceRequest().catch(showErrorNotification);
  }, [medplum, task.focus]);

  const handleNewOrderCreated = async (serviceRequest?: ServiceRequest): Promise<void> => {
    setNewOrderModalOpened(false);
    setLabServiceRequest(serviceRequest);
  };

  if (!serviceRequest) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <Stack p={0}>
        <Stack gap={0}>
          <Title>{getDisplayString(task)}</Title>
        </Stack>

        {(labServiceRequest?.status === 'draft' || labServiceRequest?.status === 'on-hold') && (
          <Group>
            <Button onClick={() => setNewOrderModalOpened(true)} variant="outline" leftSection={<IconPlus size={16} />}>
              Request Labs
            </Button>
          </Group>
        )}

        {task.for &&
          labServiceRequest?.status !== 'draft' &&
          labServiceRequest?.status !== 'on-hold' &&
          labServiceRequest?.id && (
            <>
              <Text> ✅ Order Sent | Requisition: {labServiceRequest?.requisition?.value} </Text>
              <Group>
                <Button
                  component="a"
                  target="_blank"
                  href={`/${task.for.reference}/ServiceRequest/${labServiceRequest.id}`}
                >
                  View in Labs
                </Button>
              </Group>
            </>
          )}
      </Stack>

      <Modal
        opened={newOrderModalOpened}
        onClose={() => setNewOrderModalOpened(false)}
        size="xl"
        centered
        title="Order Labs"
      >
        <OrderLabsPage
          encounter={task.encounter as Reference<Encounter>}
          task={task as Reference<Task>}
          tests={tests}
          performingLab={performingLab}
          onSubmitLabOrder={handleNewOrderCreated}
        />
      </Modal>
    </>
  );
};
