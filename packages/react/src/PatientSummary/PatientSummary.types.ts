// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient, Resource } from '@medplum/fhirtypes';
import type { FhirSearchDescriptor, SectionResults } from '@medplum/react-hooks';
import type { ComponentType } from 'react';

export type { FhirSearchDescriptor, SectionResults };

/** Context passed to every section's component. */
export interface SectionRenderContext {
  readonly patient: Patient;
  readonly onClickResource?: (resource: Resource) => void;
  /** Named results for each search in the section's `searches` array, keyed by `FhirSearchDescriptor.key`. */
  readonly results: SectionResults;
}

/**
 * Configuration for a single section in the PatientSummary.
 * The `searches` field is an array to support sections like Labs which need multiple resource types.
 */
export interface PatientSummarySectionConfig {
  readonly key: string;
  readonly title: string;
  readonly searches?: FhirSearchDescriptor[];
  /**
   * React component that renders this section.
   * Using ComponentType (rather than a render-prop function) ensures React treats it as a real
   * component, so hooks inside custom sections work correctly.
   */
  readonly component: ComponentType<SectionRenderContext>;
}
