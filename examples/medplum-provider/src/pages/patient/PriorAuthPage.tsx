// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, Group, JsonInput, NativeSelect, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { CdsDiscoveryResponse, CdsResponse, WithId } from '@medplum/core';
import { buildCdsRequest, getDisplayString, getReferenceString, isOk } from '@medplum/core';
import type { Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { Document, Form, Loading, useMedplum, useSearchResources } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';

export function PriorAuthPage(): JSX.Element {
  const medplum = useMedplum();
  const patient = usePatient();
  const [cdsServices, setCdsServices] = useState<CdsDiscoveryResponse>();
  const [cdsHook, setCdsHook] = useState('');
  const [draftOrders, draftOrdersLoading, draftOrdersOutcome] = useSearchResources('ServiceRequest', {
    status: 'draft',
    patient: patient?.id,
  });
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState<CdsResponse>();

  useEffect(() => {
    medplum
      .getCdsServices()
      .then(setCdsServices)
      .catch((error) => {
        console.error(error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load CDS services',
          color: 'red',
        });
      });
  }, [medplum]);

  const handleSubmit = async (): Promise<void> => {
    setSubmitting(true);
    try {
      if (!patient) {
        notifications.show({
          title: 'Error',
          message: 'Patient information is not available',
          color: 'red',
        });
        return;
      }
      if (!cdsServices) {
        notifications.show({
          title: 'Error',
          message: 'CDS services are not loaded yet',
          color: 'red',
        });
        return;
      }
      if (draftOrders === undefined) {
        notifications.show({
          title: 'Error',
          message: 'Draft orders are still loading',
          color: 'red',
        });
        return;
      }
      if (!cdsHook) {
        notifications.show({
          title: 'Error',
          message: 'Select a CDS service',
          color: 'red',
        });
        return;
      }

      const service = cdsServices.services.find((s) => s.hook === cdsHook);
      if (!service) {
        notifications.show({
          title: 'Error',
          message: 'CDS Service not found for the selected hook',
          color: 'red',
        });
        return;
      }

      const profile = medplum.getProfile();
      if (profile?.resourceType !== 'Practitioner') {
        notifications.show({
          title: 'Error',
          message: 'User must be a Practitioner to submit prior authorization',
          color: 'red',
        });
        return;
      }
      const user = profile as WithId<Practitioner>;

      if (cdsHook === 'order-sign' && selectedOrders.length === 0) {
        notifications.show({
          title: 'Error',
          message: 'Select at least one draft order',
          color: 'red',
        });
        return;
      }

      const context = {
        userId: getReferenceString(user),
        patientId: patient.id,
        draftOrders: {
          resourceType: 'Bundle',
          type: 'collection',
          entry: draftOrders
            .filter((order): order is WithId<ServiceRequest> => order.id !== undefined && selectedOrders.includes(order.id))
            .map((order) => ({
              resource: order,
            })),
        },
      };

      // Build the CDS request
      // Note that we use the Medplum client to build the request
      // That's because we're going to need FHIR resources from the Medplum server
      const request = await buildCdsRequest(medplum, user, service, context);

      // Call the CDS service
      const cdsResponse = await medplum.callCdsService(service.id, request);
      notifications.show({
        title: 'Success',
        message: 'Prior authorization request submitted',
        color: 'green',
      });
      setResponse(cdsResponse);
    } catch (error) {
      console.error(error);
      showErrorNotification(error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!patient || !cdsServices) {
    return <Loading />;
  }

  if (draftOrdersLoading) {
    return <Loading />;
  }

  if (draftOrdersOutcome && !isOk(draftOrdersOutcome)) {
    return (
      <Document>
        <Title order={1}>Prior Authorization</Title>
        <Text c="red">Failed to load draft orders. Refresh the page to try again.</Text>
      </Document>
    );
  }

  if (draftOrders === undefined) {
    return <Loading />;
  }

  return (
    <Document>
      <Title order={1}>Prior Authorization</Title>
      <Form onSubmit={handleSubmit}>
        <fieldset disabled={submitting} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
          <Stack>
            <NativeSelect
              label="CDS Service"
              description="Choose a CDS Service to trigger the prior authorization process."
              data={['', ...cdsServices.services.map((service) => service.hook)]}
              value={cdsHook}
              onChange={(event) => setCdsHook(event.currentTarget.value)}
            />
            {cdsHook === 'order-sign' && draftOrders.length === 0 && (
              <Text c="dimmed">No draft orders available for prior authorization</Text>
            )}
            {cdsHook === 'order-sign' &&
              draftOrders
                .filter((order): order is WithId<ServiceRequest> => order.id !== undefined)
                .map((order) => (
                  <Checkbox
                    key={order.id}
                    checked={selectedOrders.includes(order.id)}
                    label={getDisplayString(order)}
                    onChange={(event) => {
                      if (event.currentTarget.checked) {
                        setSelectedOrders([...selectedOrders, order.id]);
                      } else {
                        setSelectedOrders(selectedOrders.filter((id) => id !== order.id));
                      }
                    }}
                  />
                ))}
            <Group justify="right">
              <Button type="submit" loading={submitting}>
                Submit
              </Button>
            </Group>
            {response && (
              <JsonInput
                name="resource"
                autosize
                minRows={24}
                defaultValue={JSON.stringify(response, null, 2)}
                formatOnBlur
                deserialize={JSON.parse}
              />
            )}
          </Stack>
        </fieldset>
      </Form>
    </Document>
  );
}
