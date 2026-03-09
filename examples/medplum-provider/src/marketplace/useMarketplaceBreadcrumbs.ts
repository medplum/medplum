// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useOutletContext } from 'react-router';
import type { MarketplaceOutletContext } from './MarketplaceLayout';

export function useMarketplaceBreadcrumbs(): MarketplaceOutletContext {
  return useOutletContext<MarketplaceOutletContext>();
}
