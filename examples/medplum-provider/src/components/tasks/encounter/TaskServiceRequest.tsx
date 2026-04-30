// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import type { DiagnosticReport, Organization, Reference, ServiceRequest, Task } from '@medplum/fhirtypes';
import type { LabOrganization, TestCoding } from '@medplum/health-gorilla-core';
import { useMedplum, useResource } from '@medplum/react';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { OrderLabsPage } from '../../../pages/labs/OrderLabsPage';
import { showErrorNotification } from '../../../utils/notifications';

interface TaskServiceRequestProps {
  task: Task;
  saveDiagnosticReport: (diagnosticReport: DiagnosticReport) => void;
}

const SNOMED_SYSTEM = 'http://snomed.info/sct';
const SNOMED_LAB_PROCEDURE_CODE = '108252007';

export const TaskServiceRequest = (props: TaskServiceRequestProps): JSX.Element => {
  const { task } = props;
  const medplum = useMedplum();
  const serviceRequest = useResource(task.focus as Reference<ServiceRequest>);
  const [newOrderModalOpened, setNewOrderModalOpened] = useState(false);
  const [labServiceRequest, setLabServiceRequest] = useState<ServiceRequest | undefined>(undefined);
  const [performingLab, setPerformingLab] = useState<LabOrganization | undefined>(undefined);
  const performerReferences = serviceRequest?.performer;

  useEffect(() => {
    const fetchPerformingLabFromPerformer = async (): Promise<void> => {
      const orgRef = performerReferences?.find((ref) => ref.reference?.startsWith('Organization/'));
      if (!orgRef) {
        setPerformingLab(undefined);
        return;
      }
      const org = await medplum.readReference(orgRef as Reference<Organization>);
      setPerformingLab(org);
    };
    fetchPerformingLabFromPerformer().catch(showErrorNotification);
  }, [medplum, performerReferences]);

  const tests: TestCoding[] | undefined = serviceRequest?.code?.coding
    ?.filter((coding) => coding.system === SNOMED_SYSTEM && coding.code !== SNOMED_LAB_PROCEDURE_CODE)
    .map((coding) => ({
      system: 'urn:uuid:f:388554647b89801ea5e8320b',
      code: coding.code,
      display: coding.display,
    })) as TestCoding[];

  const isLabServiceRequest = serviceRequest?.category?.some((category) =>
    category.coding?.some((coding) => coding.system === SNOMED_SYSTEM && coding.code === SNOMED_LAB_PROCEDURE_CODE)
  );

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

        {isLabServiceRequest && (labServiceRequest?.status === 'draft' || labServiceRequest?.status === 'on-hold') && (
          <Group>
            <Button onClick={() => setNewOrderModalOpened(true)} variant="outline" leftSection={<IconPlus size={16} />}>
              Request Labs
            </Button>
          </Group>
        )}

        {isLabServiceRequest &&
          task.for &&
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
          encounter={task.encounter}
          task={task}
          tests={tests}
          performingLab={performingLab}
          onSubmitLabOrder={handleNewOrderCreated}
        />
      </Modal>
    </>
  );
};
