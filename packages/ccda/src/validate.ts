// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  createStructureIssue,
  indexStructureDefinitionBundle,
  OperationOutcomeError,
  tryGetDataType,
  validateTypedValue,
} from '@medplum/core';
import type { Bundle, OperationOutcomeIssue, StructureDefinition } from '@medplum/fhirtypes';
import { XMLValidator } from 'fast-xml-parser';
import { parseCcdaXml } from './parse';

const CLINICAL_DOCUMENT = 'http://hl7.org/cda/stds/core/StructureDefinition/ClinicalDocument';

/**
 * Loads the HL7 CDA R2 logical model, which `validateCcda` validates against.
 *
 * The model is distributed in `@medplum/definitions`:
 *
 * ```ts
 * indexCdaDefinitions(readJson('fhir/cda/hl7.cda.uv.core-2.0.0-sd.json'));
 * ```
 * @param bundle - The CDA StructureDefinitions.
 */
export function indexCdaDefinitions(bundle: Bundle | StructureDefinition[]): void {
  indexStructureDefinitionBundle(bundle, { xmlPropertyNames: true });
}

/**
 * Validates C-CDA XML against the HL7 CDA R2 logical model: well-formed XML, then CDA structure, cardinality,
 * `xsi:type`, and data type formats. C-CDA template conformance statements are not checked.
 *
 * Requires the CDA logical model, loaded with `indexCdaDefinitions`.
 *
 * Issue locations are FHIRPath expressions on the CDA logical model, e.g. "ClinicalDocument.effectiveTime.value".
 * @param xml - The C-CDA XML.
 * @returns The validation issues. Unlike `validateResource`, errors are returned, not thrown.
 */
export function validateCcda(xml: string): OperationOutcomeIssue[] {
  if (!tryGetDataType(CLINICAL_DOCUMENT)) {
    throw new Error('CDA definitions not loaded; call indexCdaDefinitions first');
  }

  const syntax = XMLValidator.validate(xml);
  if (syntax !== true) {
    const { msg, line, col } = syntax.err;
    return [createStructureIssue('ClinicalDocument', `${msg} (line ${line}, column ${col})`)];
  }

  // Keep repeated single elements, so that validation reports them
  const document = parseCcdaXml(xml, true);
  if (!document) {
    return [createStructureIssue('ClinicalDocument', 'Root element must be ClinicalDocument')];
  }

  try {
    return validateTypedValue({ type: CLINICAL_DOCUMENT, value: document });
  } catch (err) {
    if (err instanceof OperationOutcomeError) {
      return err.outcome.issue;
    }
    throw err;
  }
}
