// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DiagnosticReport, Organization, Practitioner } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { LabResultListItemView } from './LabResultListItemView';

export interface LabResultListItemProps {
  readonly report: DiagnosticReport;
  readonly selected: boolean;
  readonly to: string;
}

/**
 * A lab result row that resolves the performer through the Medplum client and links with MedplumLink.
 * @param props - The report, the selection, and the destination.
 * @returns The list row.
 */
export function LabResultListItem(props: LabResultListItemProps): JSX.Element {
  const { report, selected, to } = props;
  const performer = useResource(report.performer?.[0]) as Practitioner | Organization | undefined;

  return (
    <MedplumLink to={to} underline="never">
      <LabResultListItemView report={report} selected={selected} performer={performer} />
    </MedplumLink>
  );
}
