// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Loader } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference, isReference, normalizeErrorString } from '@medplum/core';
import type { DiagnosticReport, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { LabOrderDetails } from './LabOrderDetails';
import { LabResultDetails } from './LabResultDetails';

export interface LabDetailPaneProps {
  readonly item: WithId<ServiceRequest> | WithId<DiagnosticReport>;
  readonly onOrderChange?: (order: WithId<ServiceRequest>) => void;
  readonly onResumeOrder?: (order: WithId<ServiceRequest>) => void;
}

/**
 * The detail pane for a selected lab item, reading a report's order through the Medplum client
 * and rendering the Medplum-backed order and result details.
 * @param props - The lab item to render.
 * @returns The detail pane for the given lab item.
 */
export function LabDetailPane(props: LabDetailPaneProps): JSX.Element {
  const { item, onOrderChange, onResumeOrder } = props;
  const medplum = useMedplum();

  const basedOnRef =
    item.resourceType === 'DiagnosticReport'
      ? item.basedOn?.find((ref): ref is Reference<ServiceRequest> => isReference(ref, 'ServiceRequest'))
      : undefined;

  // A ServiceRequest item is its own order; a DiagnosticReport's order is
  // fetched from its basedOn reference.
  const [order, setOrder] = useState<WithId<ServiceRequest> | undefined>(
    item.resourceType === 'ServiceRequest' ? item : undefined
  );
  const [loading, setLoading] = useState<boolean>(!!basedOnRef);

  useEffect(() => {
    let subscribed = true;
    const fetchOrder = async (): Promise<void> => {
      if (item.resourceType === 'ServiceRequest') {
        setOrder(item);
        setLoading(false);
        return;
      }
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
        if (subscribed) {
          showNotification({ color: 'red', message: normalizeErrorString(err) });
        }
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
  }, [medplum, item, basedOnRef]);

  return (
    <LabDetailPaneView
      item={item}
      order={order}
      loading={loading}
      renderOrder={(current, selectedReport) => (
        <LabOrderDetails
          order={current}
          selectedReport={selectedReport}
          onChange={(updated) => {
            setOrder(updated);
            onOrderChange?.(updated);
          }}
          onResume={onResumeOrder ? () => onResumeOrder(current) : undefined}
        />
      )}
      renderResult={(result) => <LabResultDetails result={result} />}
    />
  );
}

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
