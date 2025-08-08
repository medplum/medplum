// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Bundle, Coverage, Questionnaire, ServiceRequest } from '@medplum/fhirtypes';
import {
  BillingInformation,
  DiagnosisCodeableConcept,
  LabOrderInputErrors,
  LabOrderTestMetadata,
  LabOrganization,
  TestCoding,
} from '@medplum/health-gorilla-core';
import { createContext } from 'react';

export type TestMetadata = LabOrderTestMetadata & {
  aoeStatus: 'loading' | 'loaded' | 'none' | 'error';
  /** The AOE `Questionnaire`, if any, containing Ask at Order Entry (AOE) questions for the test.  */
  aoeQuestionnaire?: Questionnaire;
};

export type HealthGorillaLabOrderState = {
  performingLab: LabOrganization | undefined;
  performingLabAccountNumber: string | undefined;
  selectedTests: TestCoding[];
  testMetadata: Record<string, TestMetadata | undefined>;
  diagnoses: DiagnosisCodeableConcept[];
  billingInformation: BillingInformation;
  specimenCollectedDateTime: Date | undefined;
  orderNotes: string | undefined;
};

export type UseHealthGorillaLabOrderReturn = {
  state: HealthGorillaLabOrderState;

  searchAvailableLabs: (query: string) => Promise<LabOrganization[]>;
  /**
   * Set the desired performer for doing the diagnostic testing. Compatible with
   * results from the `searchAvailableLabs` function.
   */
  setPerformingLab: (lab: LabOrganization | undefined) => void;
  /**
   * Sets the account number for the performing lab. If not provided, the
   * `HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER` `Project.secret` is used.
   */
  setPerformingLabAccountNumber: (accountNumber: string | undefined) => void;

  searchAvailableTests: (query: string) => Promise<TestCoding[]>;
  addTest: (test: TestCoding) => void;
  removeTest: (test: TestCoding) => void;
  setTests: (tests: TestCoding[]) => void;

  updateTestMetadata: (test: TestCoding, metadata: Partial<LabOrderTestMetadata>) => void;

  addDiagnosis: (diagnosis: DiagnosisCodeableConcept) => void;
  removeDiagnosis: (diagnosis: DiagnosisCodeableConcept) => void;
  setDiagnoses: (diagnoses: DiagnosisCodeableConcept[]) => void;

  getActivePatientCoverages: () => Promise<Coverage[]>;
  updateBillingInformation: (billingInfo: Partial<BillingInformation>) => void;

  setSpecimenCollectedDateTime: (date: Date | undefined) => void;

  setOrderNotes: (orderNotes: string | undefined) => void;

  validateOrder: () => LabOrderInputErrors | undefined;
  createOrderBundle: () => Promise<{ transactionResponse: Bundle; serviceRequest: ServiceRequest }>;
};

export const HealthGorillaLabOrderContext = createContext<UseHealthGorillaLabOrderReturn | undefined>(undefined);
