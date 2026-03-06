// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export type ListingType =
  | 'App'
  | 'Automation'
  | 'Template'
  | 'Content Pack'
  | 'Agent Prompt / Skill'
  | 'Service Provider';

export interface Vendor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly logo: string;
  readonly website?: string;
}

export interface MarketplaceListing {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly type: ListingType;
  readonly categories: string[];
  readonly vendor: Vendor;
  readonly version: string;
  readonly lastUpdated: string;
  readonly icon: string;
  readonly features: string[];
  readonly screenshots?: string[];
  readonly relatedListingIds?: string[];
  readonly collectionIds?: string[];
  readonly popularity: number;
  readonly compatibility?: string;
  readonly serviceTypes?: string[];
  readonly contactUrl?: string;
  readonly supportUrl?: string;
  readonly docsUrl?: string;
  readonly termsUrl?: string;
  readonly privacyUrl?: string;
}

export interface Collection {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly listingIds: string[];
}

export interface InstalledItem {
  readonly listingId: string;
  readonly installedAt: string;
  readonly status: 'active' | 'installing' | 'error';
}
