// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { QueryTypes } from '@medplum/core';
import type { Patient, Resource, ResourceType } from '@medplum/fhirtypes';
import type { ReactNode } from 'react';

/** Descriptor for a single FHIR search that a section needs. */
export interface FhirSearchDescriptor {
  readonly resourceType: ResourceType;
  /** Which search param references the patient. Defaults to 'subject'. Examples: 'patient', 'beneficiary'. */
  readonly patientParam?: string;
  /** Additional search params — same format as the 2nd arg to medplum.searchResources(). */
  readonly query?: QueryTypes;
}

/** Context passed to every section's render function. */
export interface SectionRenderContext {
  readonly patient: Patient;
  readonly onClickResource?: (resource: Resource) => void;
  /** One Resource[] per search in the section's `searches` array. Empty array if no searches defined. */
  readonly results: Resource[][];
}

/**
 * Configuration for a single section in the PatientSummary.
 * The `searches` field is an array to support sections like Labs which need multiple resource types.
 */
export interface PatientSummarySectionConfig {
  readonly key: string;
  readonly title: string;
  readonly searches?: FhirSearchDescriptor[];
  readonly render: (context: SectionRenderContext) => ReactNode;
}
