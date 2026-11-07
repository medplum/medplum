// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Loader } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, isReference, normalizeErrorString } from '@medplum/core';
import type { DiagnosticReport, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { renderMedplumLink } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { LabOrderDetailsView, useLabOrderDetailsData } from './LabOrderDetails';
import { LabResultDetailsView, useLabResultDetailsData } from './LabResultDetails';

/**
 * Fetches the detail pane's order: a ServiceRequest item is its own order; a DiagnosticReport's
 * order is read from its basedOn reference. Partners call this (or implement the same walk
 * against their API) and pass the result as `order` on LabDetailPaneView.
 * @param medplum - The Medplum client.
 * @param item - The selected lab item.
 * @returns The resolved order, or undefined if the item is a report with no basedOn.
 */
export async function fetchLabDetailPaneOrder(
  medplum: MedplumClient,
  item: WithId<ServiceRequest> | WithId<DiagnosticReport>
): Promise<WithId<ServiceRequest> | undefined> {
  if (item.resourceType === 'ServiceRequest') {
    return item;
  }
  const basedOnRef = item.basedOn?.find((ref): ref is Reference<ServiceRequest> =>
    isReference(ref, 'ServiceRequest')
  );
  if (!basedOnRef) {
    return undefined;
  }
  return medplum.readReference(basedOnRef);
}

export interface LabDetailPaneProps {
  readonly item: WithId<ServiceRequest> | WithId<DiagnosticReport>;
  readonly onOrderChange?: (order: WithId<ServiceRequest>) => void;
  readonly onResumeOrder?: (order: WithId<ServiceRequest>) => void;
}

/**
 * Resolves the order for a lab detail pane item. A ServiceRequest item is its own order; a
 * DiagnosticReport's order is read from its basedOn reference.
 * @param item - The lab item, or undefined to keep the hook idle.
 * @returns The resolved order, a loading flag, and a setter for in-place updates (e.g. after revoke).
 */
export function useLabDetailPaneOrder(item: WithId<ServiceRequest> | WithId<DiagnosticReport> | undefined): {
  order: WithId<ServiceRequest> | undefined;
  loading: boolean;
  setOrder: (order: WithId<ServiceRequest>) => void;
} {
  const medplum = useMedplum();
  const needsFetch =
    item?.resourceType === 'DiagnosticReport' &&
    !!item.basedOn?.find((ref) => isReference(ref, 'ServiceRequest'));

  const [order, setOrder] = useState<WithId<ServiceRequest> | undefined>(
    item?.resourceType === 'ServiceRequest' ? item : undefined
  );
  const [loading, setLoading] = useState<boolean>(needsFetch);

  useEffect(() => {
    let subscribed = true;
    if (!item) {
      setOrder(undefined);
      setLoading(false);
      return undefined;
    }
    if (item.resourceType === 'ServiceRequest') {
      setOrder(item);
      setLoading(false);
      return undefined;
    }
    const basedOnRef = item.basedOn?.find((ref): ref is Reference<ServiceRequest> =>
      isReference(ref, 'ServiceRequest')
    );
    setOrder(undefined);
    if (!basedOnRef) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    fetchLabDetailPaneOrder(medplum, item)
      .then((resolved) => {
        if (subscribed) {
          setOrder(resolved);
        }
      })
      .catch((err) => {
        if (subscribed) {
          showNotification({ color: 'red', message: normalizeErrorString(err) });
        }
      })
      .finally(() => {
        if (subscribed) {
          setLoading(false);
        }
      });
    return () => {
      subscribed = false;
    };
  }, [medplum, item]);

  return { order, loading, setOrder };
}

/**
 * The detail pane for a selected lab item. Reads the report's order through the Medplum client
 * and renders the order and result Views with their data resolved by this wrapper's hooks.
 * @param props - The lab item to render.
 * @returns The detail pane for the given lab item.
 */
export function LabDetailPane(props: LabDetailPaneProps): JSX.Element {
  const { item, onOrderChange, onResumeOrder } = props;
  const { order, loading, setOrder } = useLabDetailPaneOrder(item);
  const selectedReportRef =
    item.resourceType === 'DiagnosticReport' ? createReference(item) : undefined;
  const orderData = useLabOrderDetailsData(order, selectedReportRef);
  // Only resolve result-only data once the order probe has finished and come back empty;
  // otherwise useLabOrderDetailsData already fetches the report's attachments + resources.
  const resultData = useLabResultDetailsData(
    !loading && !order && item.resourceType === 'DiagnosticReport' ? item : undefined
  );

  return (
    <LabDetailPaneView
      item={item}
      order={order}
      loading={loading}
      renderOrder={(current, selectedReport) => (
        <LabOrderDetailsView
          order={current}
          patient={orderData.patient}
          requester={orderData.requester}
          report={orderData.report}
          reportLoading={orderData.reportLoading}
          reportAttachments={orderData.reportAttachments}
          reportResources={orderData.reportResources}
          requisitionDocuments={orderData.requisitionDocuments}
          requisitionDocumentsLoading={orderData.requisitionDocumentsLoading}
          specimenLabelDocuments={orderData.specimenLabelDocuments}
          specimenLabelDocumentsLoading={orderData.specimenLabelDocumentsLoading}
          questionnaireResponse={orderData.questionnaireResponse}
          defaultTab={selectedReport ? 'report' : undefined}
          onRevoke={() =>
            orderData
              .revoke()
              .then((updated) => {
                setOrder(updated);
                onOrderChange?.(updated);
              })
              .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }))
          }
          onResume={onResumeOrder ? () => onResumeOrder(current) : undefined}
          renderLink={renderMedplumLink}
        />
      )}
      renderResult={(result) => (
        <LabResultDetailsView
          result={result}
          attachments={resultData.attachments}
          resources={resultData.resources}
          renderLink={renderMedplumLink}
        />
      )}
    />
  );
}

/**
 * Props for LabDetailPaneView.
 *
 * - `item`: the selected lab item — a ServiceRequest (order) or DiagnosticReport (result).
 * - `order`: the item's order. ServiceRequest items are their own order; for a DiagnosticReport,
 *   resolve `basedOn[0]` and pass the result, or leave undefined if the report has no order.
 * - `loading`: true while the caller is still resolving `order`; shows a loader.
 * - `renderOrder`: renders the order details. Called with `(order, selectedReport)` where
 *   `selectedReport` is `createReference(item)` when `item` is a DiagnosticReport.
 * - `renderResult`: renders the standalone result details when `order` is undefined.
 */
export interface LabDetailPaneViewProps {
  readonly item: WithId<ServiceRequest> | WithId<DiagnosticReport>;
  readonly order?: WithId<ServiceRequest>;
  readonly loading?: boolean;
  readonly renderOrder: (
    order: WithId<ServiceRequest>,
    selectedReport: Reference<DiagnosticReport> | undefined
  ) => ReactNode;
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
