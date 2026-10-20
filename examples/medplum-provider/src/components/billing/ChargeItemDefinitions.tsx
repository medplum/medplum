// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { SearchControl } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { ChargeItemDefinitionModal } from './ChargeItemDefinitionModal';

/** The `resourceId` that opens the modal for a new charge item. */
const NEW_CHARGE_ITEM_ID = 'new';

const DEFAULT_SEARCH: SearchRequest = {
  resourceType: 'ChargeItemDefinition',
  fields: ['title', 'code', '_lastUpdated', 'status'],
  sortRules: [{ code: 'title' }],
  count: 20,
  offset: 0,
};

/**
 * Props for the charge items tab. `resourceId` mirrors the URL: the ID of the ChargeItemDefinition whose modal is
 * open, or `NEW_CHARGE_ITEM_ID` for a new one. The tab never navigates itself but calls `onNavigate` with the ID
 * the URL should move to, or none to close the modal.
 */
export interface ChargeItemDefinitionsTabProps {
  readonly resourceId?: string;
  readonly onNavigate: (resourceId?: string) => void;
}

export function ChargeItemDefinitions(props: ChargeItemDefinitionsTabProps): JSX.Element {
  const { resourceId, onNavigate } = props;
  const [search, setSearch] = useState<SearchRequest>(DEFAULT_SEARCH);
  const [savedVersion, setSavedVersion] = useState(0);

  return (
    <>
      <SearchControl
        key={savedVersion}
        search={search}
        hideFilters
        onNew={() => onNavigate(NEW_CHARGE_ITEM_ID)}
        onChange={(e) => setSearch(e.definition)}
        onClick={(e) => onNavigate(e.resource.id)}
      />
      <ChargeItemDefinitionModal
        chargeItemId={resourceId === NEW_CHARGE_ITEM_ID ? undefined : resourceId}
        opened={resourceId !== undefined}
        onClose={() => onNavigate()}
        onSaved={() => setSavedVersion((version) => version + 1)}
      />
    </>
  );
}
