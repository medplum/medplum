// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Loader } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { DiagnosticReport, Reference, ServiceRequest } from '@medplum/fhirtypes';
import type { JSX, ReactNode } from 'react';
import { Fragment } from 'react';

export interface LabDetailPaneViewProps {
  readonly item: WithId<ServiceRequest> | WithId<DiagnosticReport>;
  /** The item's order: an order is its own; a report's is the ServiceRequest it is based on, resolved by the caller. */
  readonly order?: WithId<ServiceRequest>;
  /** True while the caller is still reading a report's order. */
  readonly loading?: boolean;
  /** Renders the order details, with the item selected as the report when the item is a report. */
  readonly renderOrder: (
    order: WithId<ServiceRequest>,
    selectedReport: Reference<DiagnosticReport> | undefined
  ) => ReactNode;
  /** Renders the details of a report that has no order. */
  readonly renderResult: (result: WithId<DiagnosticReport>) => ReactNode;
}

/**
 * The detail pane for a selected lab item. An order shows the order details. A report that is
 * based on an order shows the order details with that report selected; otherwise it shows the
 * result details. It holds no client: the caller resolves the order and renders the details.
 * @param props - The item, its resolved order, and the detail renderers.
 * @returns The detail pane.
 */
export function LabDetailPaneView(props: LabDetailPaneViewProps): JSX.Element {
  const { item, loading = false, renderOrder, renderResult } = props;
  const order = props.order ?? (item.resourceType === 'ServiceRequest' ? item : undefined);
  const selectedReport = item.resourceType === 'DiagnosticReport' ? createReference(item) : undefined;

  return (
    <Box h="100%" flex={1} style={{ overflow: 'hidden' }}>
      {loading ? (
        <Center h="100%">
          <Loader />
        </Center>
      ) : (
        <>
          {order && (
            <Fragment key={`${order.id}:${selectedReport?.reference ?? ''}`}>
              {renderOrder(order, selectedReport)}
            </Fragment>
          )}
          {!order && item.resourceType === 'DiagnosticReport' && (
            <Fragment key={item.id}>{renderResult(item)}</Fragment>
          )}
        </>
      )}
    </Box>
  );
}
