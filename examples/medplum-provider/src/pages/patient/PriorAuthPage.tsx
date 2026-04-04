// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, Group, Loader, NativeSelect, Stack, Title } from '@mantine/core';
import type { CdsDiscoveryResponse } from '@medplum/core';
import { getDisplayString } from '@medplum/core';
import { Document, Form, useMedplum, useSearchResources } from '@medplum/react';
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

  useEffect(() => {
    medplum.getCdsServices().then(setCdsServices).catch(console.error);
  }, [medplum, setCdsServices]);

  if (!patient || !cdsServices) {
    return <Loader />;
  }

  return (
    <Document>
      <Title order={1}>Prior Authorization</Title>
      <p>This is a placeholder for the Prior Authorization page.</p>
      <p>Patient: {patient.name?.[0]?.text}</p>
      <Form onSubmit={console.log}>
        <Stack>
          <NativeSelect
            label="CDS Hook"
            description="Choose a CDS Hook to trigger the prior authorization process."
            // data={['', 'order-sign', 'order-dispatch', 'appointment-book']}
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
            <Button type="submit">Submit</Button>
          </Group>
        </Stack>
      </Form>
    </Document>
  );
}
