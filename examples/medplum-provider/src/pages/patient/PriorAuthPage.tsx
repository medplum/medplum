// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, Group, JsonInput, NativeSelect, Stack, Title } from '@mantine/core';
import type { CdsDiscoveryResponse, CdsResponse, WithId } from '@medplum/core';
import { buildCdsRequest, getDisplayString, getReferenceString } from '@medplum/core';
import type { Practitioner } from '@medplum/fhirtypes';
import { Document, Form, Loading, useMedplum, useSearchResources } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { usePatient } from '../../hooks/usePatient';

export function PriorAuthPage(): JSX.Element {
  const medplum = useMedplum();
  const patient = usePatient();
  const [cdsServices, setCdsServices] = useState<CdsDiscoveryResponse>();
  const [cdsHook, setCdsHook] = useState('');
  const [draftOrders] = useSearchResources('ServiceRequest', { status: 'draft', patient: patient?.id });
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState<CdsResponse>();

  useEffect(() => {
    medplum.getCdsServices().then(setCdsServices).catch(console.error);
  }, [medplum, setCdsServices]);

  const handleSubmit = async (): Promise<void> => {
    setSubmitting(true);
    try {
      if (!patient || !cdsServices || !draftOrders) {
        return;
      }

      const service = cdsServices.services.find((service) => service.hook === cdsHook);
      if (!service) {
        console.error('CDS Service not found for hook:', cdsHook);
        return;
      }

      const user = medplum.getProfile() as WithId<Practitioner>;

      const context = {
        userId: getReferenceString(user),
        patientId: patient.id,
        draftOrders: {
          resourceType: 'Bundle',
          type: 'collection',
          entry: draftOrders
            ?.filter((order) => selectedOrders.includes(order.id))
            ?.map((order) => ({
              resource: order,
            })),
        },
      };

      // Build the CDS request
      // Note that we use the Medplum client to build the request
      // That's because we're going to need FHIR resources from the Medplum server
      const request = await buildCdsRequest(medplum, user, service, context);

      // Call the CDS service
      const response = await medplum.callCdsService(service.id, request);
      console.log('CDS Service Response:', response);
      setResponse(response);
    } finally {
      setSubmitting(false);
    }
  };

  if (!patient || !cdsServices || !draftOrders) {
    return <Loading />;
  }

  return (
    <Document>
      <Title order={1}>Prior Authorization</Title>
      <Form onSubmit={handleSubmit}>
        <Stack>
          <NativeSelect
            label="CDS Service"
            description="Choose a CDS Service to trigger the prior authorization process."
            data={['', ...cdsServices.services.map((service) => service.hook)]}
            value={cdsHook}
            onChange={(event) => setCdsHook(event.currentTarget.value)}
          />
          {cdsHook === 'order-sign' &&
            draftOrders?.map((order) => (
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
      </Form>
    </Document>
  );
}
