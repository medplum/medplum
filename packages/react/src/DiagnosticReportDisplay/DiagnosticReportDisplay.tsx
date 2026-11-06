// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { isReference } from '@medplum/core';
import type { DiagnosticReport, Observation, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import type { RenderResourceLink } from './DiagnosticReportDisplayView';
import { DiagnosticReportDisplayView, ObservationTableView } from './DiagnosticReportDisplayView';

export interface DiagnosticReportDisplayProps {
  readonly value?: DiagnosticReport | Reference<DiagnosticReport>;
  readonly hideObservationNotes?: boolean;
  readonly hideSpecimenInfo?: boolean;
  readonly hideSubject?: boolean;
}

DiagnosticReportDisplay.defaultProps = {
  hideObservationNotes: false,
  hideSpecimenInfo: false,
  hideSubject: false,
} as DiagnosticReportDisplayProps;

/**
 * Renders a diagnostic report, reading it and the resources it references through the Medplum
 * client and linking with MedplumLink.
 * @param props - The report or a reference to it, and the display options.
 * @returns The report display, or null until the report is read.
 */
export function DiagnosticReportDisplay(props: DiagnosticReportDisplayProps): JSX.Element | null {
  const diagnosticReport = useResource(props.value);
  const resources = useDiagnosticReportResources(diagnosticReport);

  if (!diagnosticReport) {
    return null;
  }

  return (
    <DiagnosticReportDisplayView
      value={diagnosticReport}
      resources={resources}
      renderLink={renderMedplumLink}
      hideObservationNotes={props.hideObservationNotes}
      hideSpecimenInfo={props.hideSpecimenInfo}
      hideSubject={props.hideSubject}
    />
  );
}

export interface ObservationTableProps {
  readonly value?: Observation[] | Reference<Observation>[];
  readonly ancestorIds?: string[];
  readonly hideObservationNotes?: boolean;
}

/**
 * Renders a table of observations, reading them and their members and performers through the
 * Medplum client and linking with MedplumLink.
 * @param props - The observations and the display options.
 * @returns The observation table.
 */
export function ObservationTable(props: ObservationTableProps): JSX.Element {
  const resources = useResolvedResources(props.value, resolveObservationResources);
  return <ObservationTableView {...props} resources={resources} renderLink={renderMedplumLink} />;
}

/**
 * Links through MedplumLink, for the Medplum-backed wrappers of the client-free views.
 * @param to - The resource or reference to link to.
 * @param children - The link content.
 * @returns The link.
 */
export const renderMedplumLink: RenderResourceLink = (to, children) => <MedplumLink to={to}>{children}</MedplumLink>;

/**
 * Reads the resources a report references through the Medplum client, for DiagnosticReportDisplayView.
 * @param report - The report.
 * @returns The resolved resources, or undefined until they are read.
 */
export function useDiagnosticReportResources(report: DiagnosticReport | undefined): Resource[] | undefined {
  return useResolvedResources(report, resolveReportResources);
}

function useResolvedResources<T>(
  input: T | undefined,
  resolveFn: (medplum: MedplumClient, input: T) => Promise<Resource[]>
): Resource[] | undefined {
  const medplum = useMedplum();
  const [resources, setResources] = useState<Resource[]>();

  useEffect(() => {
    setResources(undefined);
    if (!input) {
      return undefined;
    }
    let subscribed = true;
    resolveFn(medplum, input)
      .then((resolved) => {
        if (subscribed) {
          setResources(resolved);
        }
      })
      .catch(console.error);
    return () => {
      subscribed = false;
    };
  }, [medplum, input, resolveFn]);

  return resources;
}

async function resolveReportResources(medplum: MedplumClient, report: DiagnosticReport): Promise<Resource[]> {
  const reader = createReader(medplum, report.contained);
  const basedOn = await reader.read(report.basedOn?.[0]);
  await Promise.all([
    reader.read(report.subject),
    reader.read(basedOn?.resourceType === 'ServiceRequest' ? basedOn.requester : undefined),
    ...(report.resultsInterpreter ?? []).map((ref) => reader.read(ref)),
    ...(report.performer ?? []).map((ref) => reader.read(ref)),
    ...(report.specimen ?? []).map((ref) => reader.read(ref)),
    reader.readObservations(report.result),
  ]);
  return reader.resources;
}

async function resolveObservationResources(
  medplum: MedplumClient,
  value: Observation[] | Reference<Observation>[]
): Promise<Resource[]> {
  const reader = createReader(medplum, undefined);
  await reader.readObservations(value);
  return reader.resources;
}

interface ResourceReader {
  readonly resources: Resource[];
  read<T extends Resource>(ref: Reference<T> | undefined): Promise<T | undefined>;
  readObservations(value: Observation[] | Reference<Observation>[] | undefined): Promise<void>;
}

/**
 * Reads referenced resources once each, collecting them for a view. Contained references
 * resolve against the given contained resources and are not collected; a failed read is skipped.
 * @param medplum - The Medplum client.
 * @param contained - The contained resources that "#id" references resolve against.
 * @returns The reader.
 */
function createReader(medplum: MedplumClient, contained: Resource[] | undefined): ResourceReader {
  const resources: Resource[] = [];
  const pending = new Map<string, Promise<Resource | undefined>>();
  const visited = new Set<string>();

  async function read<T extends Resource>(ref: Reference<T> | undefined): Promise<T | undefined> {
    const refString = ref?.reference;
    if (!refString) {
      return undefined;
    }
    if (refString.startsWith('#')) {
      return contained?.find((resource) => resource.id === refString.slice(1)) as T | undefined;
    }
    let promise = pending.get(refString);
    if (!promise) {
      promise = medplum.readReference(ref as Reference).then(
        (resource) => {
          resources.push(resource);
          return resource;
        },
        () => undefined
      );
      pending.set(refString, promise);
    }
    return (await promise) as T | undefined;
  }

  async function readObservations(value: Observation[] | Reference<Observation>[] | undefined): Promise<void> {
    await Promise.all(
      ((value ?? []) as (Observation | Reference<Observation>)[]).map(async (item) => {
        const key = isReference(item) ? item.reference : `Observation/${item.id}`;
        if (visited.has(key)) {
          return;
        }
        visited.add(key);
        const observation: Observation | undefined = isReference(item)
          ? await read<Observation>(item as Reference<Observation>)
          : (item as Observation);
        if (!observation) {
          return;
        }
        await Promise.all([
          ...(observation.performer ?? []).map((ref) => read(ref)),
          readObservations(observation.hasMember as Reference<Observation>[] | undefined),
        ]);
      })
    );
  }

  return { resources, read, readObservations };
}
