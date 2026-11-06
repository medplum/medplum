// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import type { LabListItemTab } from './LabListItemView';
import { LabListItemView } from './LabListItemView';

export interface LabListItemProps {
  readonly item: ServiceRequest;
  readonly selectedItem: ServiceRequest | undefined;
  readonly activeTab: LabListItemTab;
  readonly onItemSelect: (item: ServiceRequest) => string;
}

/**
 * A lab order row that resolves the requester through the Medplum client and links with MedplumLink.
 * @param props - The order and the selection.
 * @returns The list row.
 */
export function LabListItem(props: LabListItemProps): JSX.Element {
  const { item, selectedItem, activeTab, onItemSelect } = props;
  const requester = useResource(item.requester) as Practitioner | undefined;

  return (
    <MedplumLink to={onItemSelect(item)} underline="never">
      <LabListItemView
        item={item}
        selected={selectedItem?.id === item.id}
        activeTab={activeTab}
        requester={requester}
      />
    </MedplumLink>
  );
}
