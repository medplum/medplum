// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Loader } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { isReference } from '@medplum/core';
import type { DiagnosticReport, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { LabOrderDetails } from './LabOrderDetails';
import { LabResultDetails } from './LabResultDetails';

interface LabDetailPaneProps {
  item: WithId<ServiceRequest> | WithId<DiagnosticReport>;
}

/**
 * Renders the detail pane for a selected lab item. An order (ServiceRequest)
 * shows the order details. A result (DiagnosticReport) that is based on a
 * ServiceRequest also shows the order details for that request; otherwise it
 * falls back to the result details.
 * @param props - The lab item to render.
 * @returns The detail pane for the given lab item.
 */
export function LabDetailPane(props: LabDetailPaneProps): JSX.Element {
  const { item } = props;
  const medplum = useMedplum();

  const basedOnRef =
    item.resourceType === 'DiagnosticReport'
      ? item.basedOn?.find((ref): ref is Reference<ServiceRequest> => isReference(ref, 'ServiceRequest'))
      : undefined;

  const [order, setOrder] = useState<WithId<ServiceRequest>>();
  const [loading, setLoading] = useState<boolean>(!!basedOnRef);

  useEffect(() => {
    let subscribed = true;
    const fetchOrder = async (): Promise<void> => {
      setOrder(undefined);
      if (!basedOnRef) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await medplum.readReference(basedOnRef);
        if (subscribed) {
          setOrder(result);
        }
      } catch (err) {
        showErrorNotification(err);
      } finally {
        if (subscribed) {
          setLoading(false);
        }
      }
    };
    fetchOrder().catch(console.error);
    return () => {
      subscribed = false;
    };
  }, [medplum, basedOnRef]);

  // The order to display: a ServiceRequest item is its own order.
  const displayedOrder = item.resourceType === 'ServiceRequest' ? item : order;

  return (
    <Box h="100%" style={{ flex: 1, overflow: 'hidden' }}>
      {loading ? (
        <Center h="100%">
          <Loader />
        </Center>
      ) : (
        <>
          {displayedOrder && <LabOrderDetails key={displayedOrder.id} order={displayedOrder} />}
          {!displayedOrder && item.resourceType === 'DiagnosticReport' && (
            <LabResultDetails key={item.id} result={item} />
          )}
        </>
      )}
    </Box>
  );
}
