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
import { renderMedplumLink } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { LabOrderDetailsView, useLabOrderDetailsData } from './LabOrderDetails';
import { LabResultDetailsView, useLabResultDetailsData } from './LabResultDetails';

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

  const basedOnRef =
    item?.resourceType === 'DiagnosticReport'
      ? item.basedOn?.find((ref): ref is Reference<ServiceRequest> => isReference(ref, 'ServiceRequest'))
      : undefined;

  const [order, setOrder] = useState<WithId<ServiceRequest> | undefined>(
    item?.resourceType === 'ServiceRequest' ? item : undefined
  );
  const [loading, setLoading] = useState<boolean>(!!basedOnRef);

  useEffect(() => {
    let subscribed = true;
    const fetchOrder = async (): Promise<void> => {
      if (!item) {
        setOrder(undefined);
        setLoading(false);
        return;
      }
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
  const resultData = useLabResultDetailsData(item.resourceType === 'DiagnosticReport' ? item : undefined);

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
