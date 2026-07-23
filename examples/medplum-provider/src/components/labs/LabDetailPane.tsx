// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Loader } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { isReference } from '@medplum/core';
import type { DiagnosticReport, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import type { JSX } from 'react';
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

  // A ServiceRequest is its own order. A DiagnosticReport may be based on one,
  // in which case we prefer the order view over the raw result.
  const basedOnRef =
    item.resourceType === 'DiagnosticReport'
      ? item.basedOn?.find((ref): ref is Reference<ServiceRequest> => isReference(ref, 'ServiceRequest'))
      : undefined;
  const order = useResource(item.resourceType === 'ServiceRequest' ? item : basedOnRef);

  let content: JSX.Element;
  if (order?.resourceType === 'ServiceRequest') {
    content = <LabOrderDetails key={order.id} order={order} />;
  } else if (item.resourceType === 'DiagnosticReport' && !basedOnRef) {
    // DiagnosticReport with no associated order.
    content = <LabResultDetails key={item.id} result={item} />;
  } else {
    // An order is expected but still loading; avoid flashing the result view.
    content = (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }

  return (
    <Box h="100%" style={{ flex: 1, overflow: 'hidden' }}>
      {content}
    </Box>
  );
}
