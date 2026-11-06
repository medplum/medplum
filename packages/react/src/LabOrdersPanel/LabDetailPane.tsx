// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { isReference, normalizeErrorString } from '@medplum/core';
import type { DiagnosticReport, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { LabDetailPaneView } from './LabDetailPaneView';
import { LabOrderDetails } from './LabOrderDetails';
import { LabResultDetails } from './LabResultDetails';

interface LabDetailPaneProps {
  item: WithId<ServiceRequest> | WithId<DiagnosticReport>;
  onOrderChange?: (order: WithId<ServiceRequest>) => void;
  onResumeOrder?: (order: WithId<ServiceRequest>) => void;
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
