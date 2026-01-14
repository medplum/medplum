// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { DOSESPOT_ADD_PATIENT_PHARMACY_BOT, DOSESPOT_SEARCH_PHARMACY_BOT } from './common';
import { getPharmacyIdFromOrganization } from './utils';

/**
 * Search parameters for pharmacy search.
 * See DoseSpot API section 3.13.2.
 */
export interface PharmacySearchParams {
  /** Pharmacy's store name (min 3 chars) */
  name?: string;
  /** City (min 3 chars) */
  city?: string;
  /** State (min 3 chars) */
  state?: string;
  /** Zip code (min 3 chars) */
  zip?: string;
  /** Address (min 3 chars) */
  address?: string;
  /** Phone or fax number */
  phoneOrFax?: string;
  /** Collection of pharmacy specialties (numeric values) */
  specialty?: number[];
  /** National Council for Prescription Drug Programs Identifier */
  ncpdpID?: string;
  /** Page number of results (defaults to 1) */
  pageNumber?: number;
}

/**
 * Response from adding a pharmacy to a patient's favorites.
 */
export interface AddPatientPharmacyResponse {
  /** Whether the operation was successful */
  success: boolean;
  /** A message describing the result */
  message: string;
  /** The persisted Organization resource with ID */
  organization?: Organization;
}

/**
 * State managed by the useDoseSpotPatientPharmacy hook.
 */
export interface DoseSpotPatientPharmacyState {
  /** The currently selected pharmacy Organization */
  selectedPharmacy: Organization | undefined;
  /** Whether to set the selected pharmacy as the patient's primary pharmacy */
  setAsPrimary: boolean;
}

/**
 * Return type for the useDoseSpotPatientPharmacy hook.
 */
export interface DoseSpotPatientPharmacyReturn {
  /** Current state of the hook */
  state: DoseSpotPatientPharmacyState;
  /**
   * Search for pharmacies in DoseSpot.
   * Returns synthetic Organization resources (not persisted to DB).
   */
  readonly searchPharmacies: (params: PharmacySearchParams) => Promise<Organization[]>;
  /**
   * Set the currently selected pharmacy.
   */
  readonly setSelectedPharmacy: (pharmacy: Organization | undefined) => void;
  /**
   * Set whether to add the pharmacy as the patient's primary pharmacy.
   */
  readonly setAsPrimary: (primary: boolean) => void;
  /**
   * Add the selected pharmacy to the patient's favorites in DoseSpot.
   * @param patientId - The Medplum Patient ID
   */
  readonly addFavoritePharmacy: (patientId: string) => Promise<AddPatientPharmacyResponse>;
  /**
   * Clear the state (selected pharmacy and setAsPrimary flag).
   */
  readonly clear: () => void;
}

/**
 * React hook for searching DoseSpot pharmacies and adding them to patient favorites.
 *
 * @returns The hook return object with state and methods.
 *
 * @example
 * ```tsx
 * function PharmacySearch({ patientId }: { patientId: string }) {
 *   const {
 *     state,
 *     searchPharmacies,
 *     setSelectedPharmacy,
 *     setAsPrimary,
 *     addFavoritePharmacy,
 *     clear
 *   } = useDoseSpotPatientPharmacy();
 *
 *   const handleSearch = async () => {
 *     const results = await searchPharmacies({ zip: '94118' });
 *     // Display results to user
 *   };
 *
 *   const handleAddFavorite = async () => {
 *     const result = await addFavoritePharmacy(patientId);
 *     if (result.success) {
 *       clear();
 *     }
 *   };
 * }
 * ```
 */
export function useDoseSpotPatientPharmacy(): DoseSpotPatientPharmacyReturn {
  const [selectedPharmacy, privateSetSelectedPharmacy] = useState<Organization | undefined>(undefined);
  const [setAsPrimaryState, privateSetAsPrimary] = useState<boolean>(false);
  const medplum = useMedplum();

  const state: DoseSpotPatientPharmacyState = {
    selectedPharmacy,
    setAsPrimary: setAsPrimaryState,
  };

  const searchPharmacies = useCallback(
    async (params: PharmacySearchParams): Promise<Organization[]> => {
      return (await medplum.executeBot(DOSESPOT_SEARCH_PHARMACY_BOT, params)) as Organization[];
    },
    [medplum]
  );

  const setSelectedPharmacy = (pharmacy: Organization | undefined): void => {
    privateSetSelectedPharmacy(pharmacy);
  };

  const setAsPrimary = (primary: boolean): void => {
    privateSetAsPrimary(primary);
  };

  const addFavoritePharmacy = useCallback(
    async (patientId: string): Promise<AddPatientPharmacyResponse> => {
      if (!selectedPharmacy) {
        throw new Error('Must select a pharmacy before adding it as a favorite');
      }

      const pharmacyId = getPharmacyIdFromOrganization(selectedPharmacy);
      if (!pharmacyId) {
        throw new Error('Selected pharmacy does not have a valid DoseSpot pharmacy ID');
      }

      return medplum.executeBot(DOSESPOT_ADD_PATIENT_PHARMACY_BOT, {
        patientId,
        pharmacy: selectedPharmacy,
        setAsPrimary: setAsPrimaryState,
      }) as Promise<AddPatientPharmacyResponse>;
    },
    [selectedPharmacy, setAsPrimaryState, medplum]
  );

  const clear = (): void => {
    privateSetSelectedPharmacy(undefined);
    privateSetAsPrimary(false);
  };

  return {
    state,
    searchPharmacies,
    setSelectedPharmacy,
    setAsPrimary,
    addFavoritePharmacy,
    clear,
  };
}
