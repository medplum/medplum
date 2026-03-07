// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createContext } from 'react';
import type { InstalledItem, ListingType, MarketplaceListing } from './types';

export interface MarketplaceContextValue {
  readonly installedItems: Record<string, InstalledItem>;
  readonly customListings: MarketplaceListing[];
  readonly isInstalled: (listingId: string) => boolean;
  readonly install: (listingId: string) => void;
  readonly uninstall: (listingId: string) => void;
  readonly addCustomListing: (name: string, type: ListingType, description?: string) => void;
  readonly updateCustomListing: (id: string, name: string, description?: string) => void;
}

export const MarketplaceContext = createContext<MarketplaceContextValue | undefined>(undefined);
