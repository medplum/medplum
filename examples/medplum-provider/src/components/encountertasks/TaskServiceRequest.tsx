import { CodeableConcept, Practitioner, Reference, ServiceRequest, Task } from '@medplum/fhirtypes';
import { CodeableConceptInput, ResourceInput, useMedplum } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { Button, Group, Modal, Stack, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { IconPlus } from '@tabler/icons-react';
import ProcedureDialog from './ProcedureDialog';

interface TaskServiceRequestProps {
  task: Task;
}

export const TaskServiceRequest = (props: TaskServiceRequestProps): JSX.Element => {
  const { task } = props;
  const medplum = useMedplum();
  const serviceRequestReference = task.input?.[0]?.valueReference as Reference<ServiceRequest>;
  const [serviceRequest, setServiceRequest] = useState<ServiceRequest | undefined>(undefined);
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum, SAVE_TIMEOUT_MS);

  const [procedureModalOpen, setProcedureModalOpen] = useState(false);
  // const [newProcedure, setNewProcedure] = useState<Procedure | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchServiceRequest = async (): Promise<void> => {
      if (serviceRequestReference) {
        const serviceRequest = await medplum.readReference(serviceRequestReference);
        setServiceRequest(serviceRequest);
      }
    };
    fetchServiceRequest().catch(showErrorNotification);
  }, [medplum, serviceRequestReference]);

  const updateServiceRequest = (updatedServiceRequest: ServiceRequest): void => {
    setServiceRequest(updatedServiceRequest);
    debouncedUpdateResource(updatedServiceRequest).catch(showErrorNotification);
  };

  if (!serviceRequest) {
    return <div>Loading...</div>;
  }

  const snomedCodes = serviceRequest.code?.coding?.filter((coding) => coding.system === 'http://snomed.info/sct');

  return (
    <>
      <Stack p="md">
        <Title>{getDisplayString(serviceRequest)}</Title>

        <CodeableConceptInput
          name="status"
          label="Status"
          binding="http://hl7.org/fhir/ValueSet/request-status"
          path="ServiceRequest.status"
          valuePath="status"
          defaultValue={
            serviceRequest.status
              ? {
                  coding: [
                    {
                      code: serviceRequest.status,
                      system: 'http://hl7.org/fhir/request-status',
                      display: serviceRequest.status,
                    },
                  ],
                }
              : undefined
          }
          onChange={(value: CodeableConcept | undefined) => {
            if (value) {
              setServiceRequest({ ...serviceRequest, status: value.coding?.[0]?.code as ServiceRequest['status'] });
            }
          }}
        />

        <CodeableConceptInput
          name="intent"
          label="Intent"
          binding="http://hl7.org/fhir/ValueSet/request-intent"
          path="ServiceRequest.intent"
          valuePath="intent"
          defaultValue={
            serviceRequest.intent
              ? {
                  coding: [
                    {
                      code: serviceRequest.intent,
                      system: 'http://hl7.org/fhir/request-intent',
                      display: serviceRequest.intent,
                    },
                  ],
                }
              : undefined
          }
          onChange={(value: CodeableConcept | undefined) => {
            if (value) {
              updateServiceRequest({ ...serviceRequest, intent: value.coding?.[0]?.code as ServiceRequest['intent'] });
            }
          }}
        />

        <CodeableConceptInput
          name="code"
          label="Code"
          binding="http://hl7.org/fhir/ValueSet/procedure-code"
          path="ServiceRequest.code"
          valuePath="code"
          defaultValue={
            snomedCodes
              ? {
                  coding: snomedCodes,
                }
              : undefined
          }
          onChange={(value: CodeableConcept | undefined) => {
            updateServiceRequest({ ...serviceRequest, code: value });
          }}
        />

        <ResourceInput
          name="performer"
          label="Performer"
          defaultValue={serviceRequest.performer?.[0]}
          resourceType="Practitioner"
          onChange={(value) => {
            if (value) {
              updateServiceRequest({ ...serviceRequest, performer: [value as Reference<Practitioner>] });
            } else {
              updateServiceRequest({ ...serviceRequest, performer: undefined });
            }
          }}
        />

        {serviceRequest.category?.[0]?.coding?.[0]?.system === 'http://snomed.info/sct' &&
          serviceRequest.category?.[0]?.coding?.[0]?.code === '71388002' && (
            <Button
              component="a"
              href="/Procedure/new"
              target="_blank"
              variant="outline"
              leftSection={<IconPlus size={16} />}
            >
              Add Procedure
            </Button>
          )}

        {serviceRequest.category?.[0]?.coding?.[0]?.system === 'http://snomed.info/sct' &&
          serviceRequest.category?.[0]?.coding?.[0]?.code === '108252007' && (
            <Group>
              <Button
                // component="a"
                // href="/DiagnosticReport/new"
                onClick={() => setProcedureModalOpen(true)}
                // target="_blank"
                variant="outline"
                leftSection={<IconPlus size={16} />}
              >
                Add Diagnostic Report
              </Button>
            </Group>
          )}
      </Stack>

      <Modal opened={procedureModalOpen} onClose={() => setProcedureModalOpen(false)} title="Create New Procedure" size="lg">
        <ProcedureDialog serviceRequest={serviceRequest} />
      </Modal>
    </>
  );
};
