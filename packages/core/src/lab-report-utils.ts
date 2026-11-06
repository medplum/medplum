// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DiagnosticReport, Observation, ObservationReferenceRange, Reference } from '@medplum/fhirtypes';
import { LOINC, OBSERVATION_INTERPRETATION, UCUM } from './constants';

/**
 * A source-agnostic, normalized representation of a lab report and its results.
 *
 * This is the contract between whatever extracts the data (an LLM reading a PDF, an HL7 feed,
 * manual entry, ...) and {@link buildDiagnosticReport}, which turns it into FHIR resources.
 * It intentionally carries only display names and inferred codes — never references to other
 * resources — so it can be produced without touching the server.
 */
export interface ExtractedLabReport {
  /** LOINC code for the report/panel as a whole, if one can be inferred (e.g. "58410-2" for CBC). */
  readonly loincCode?: string;
  /** Human-readable name of the report/panel (e.g. "Complete blood count panel"). */
  readonly display?: string;
  /** DiagnosticReport category code, e.g. "LAB" or "PATH" (http://terminology.hl7.org/CodeSystem/v2-0074). */
  readonly category?: string;
  /** Name of the performing lab or clinician, as printed on the report. No resource is referenced. */
  readonly performerDisplay?: string;
  /** ISO 8601 date/time the specimen was collected or the report is effective. */
  readonly effectiveDateTime?: string;
  /** ISO 8601 date/time the report was issued. */
  readonly issued?: string;
  /** Free-text conclusion / narrative summary, if present. */
  readonly conclusion?: string;
  /** The individual observations (analytes) in the report. */
  readonly results: readonly ExtractedObservation[];
}

/** A single analyte / result line extracted from a report. */
export interface ExtractedObservation {
  /** Human-readable name of the analyte (e.g. "Hemoglobin"). Required — used as CodeableConcept.text. */
  readonly display: string;
  /** LOINC code for the analyte, if one can be inferred. */
  readonly loincCode?: string;
  /** Numeric result value. Paired with {@link unit} to produce a valueQuantity. */
  readonly value?: number;
  /** UCUM unit for {@link value} (e.g. "g/dL"). */
  readonly unit?: string;
  /** Non-numeric result (e.g. "Positive", "Not detected"). Used when {@link value} is absent. */
  readonly valueString?: string;
  /**
   * ObservationInterpretation code, e.g. "H" (high), "L" (low), "HH" (critically high),
   * "N" (normal), "A" (abnormal). See {@link OBSERVATION_INTERPRETATION}.
   */
  readonly interpretationCode?: string;
  /** Reference range for the analyte, as printed on the report. */
  readonly referenceRange?: ExtractedReferenceRange;
}

/** A reference range as printed on a report. Either numeric bounds, free text, or both. */
export interface ExtractedReferenceRange {
  readonly low?: number;
  readonly high?: number;
  /** UCUM unit for {@link low}/{@link high}. Defaults to the observation's unit when omitted. */
  readonly unit?: string;
  /** Free-text range (e.g. "Negative", "13.5 - 17.5"). */
  readonly text?: string;
}

/**
 * Builds a minimal, draft {@link DiagnosticReport} from a normalized {@link ExtractedLabReport}.
 *
 * The resulting report is fully self-contained: each result is emitted as a `contained`
 * {@link Observation} and linked from `DiagnosticReport.result` via a local `#`-reference, so the
 * whole thing can be persisted with a single create and carries no dangling references. Performers
 * are represented by display name only (`Reference.display` with no target), matching a report that
 * has been parsed but not yet reconciled against real resources.
 *
 * Both the report and its observations are given `status: 'preliminary'`. Note that FHIR R4 has no
 * `draft` status for DiagnosticReport/Observation; `preliminary` ("initial/incomplete results, not
 * verified") is the closest match for a report that has been parsed but not yet reviewed.
 *
 * @param input - The normalized lab report.
 * @returns A preliminary DiagnosticReport with contained preliminary Observations.
 */
export function buildDiagnosticReport(input: ExtractedLabReport): DiagnosticReport {
  const contained: Observation[] = [];
  const result: Reference<Observation>[] = [];

  input.results.forEach((extracted, index) => {
    const id = `obs-${index + 1}`;
    contained.push(buildObservation(extracted, id, input.performerDisplay, input.effectiveDateTime));
    result.push({ reference: `#${id}`, display: extracted.display });
  });

  const report: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    status: 'preliminary',
    code: input.loincCode
      ? { coding: [{ system: LOINC, code: input.loincCode, display: input.display }], text: input.display }
      : { text: input.display ?? 'Laboratory report' },
  };

  if (input.category) {
    report.category = [
      { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: input.category }] },
    ];
  }
  if (input.performerDisplay) {
    report.performer = [{ display: input.performerDisplay }];
  }
  if (input.effectiveDateTime) {
    report.effectiveDateTime = input.effectiveDateTime;
  }
  if (input.issued) {
    report.issued = input.issued;
  }
  if (input.conclusion) {
    report.conclusion = input.conclusion;
  }
  if (contained.length > 0) {
    report.contained = contained;
    report.result = result;
  }

  return report;
}

/**
 * Builds a single draft {@link Observation} from an {@link ExtractedObservation}.
 *
 * @param extracted - The normalized result line.
 * @param id - The contained-resource id to assign (used for the `DiagnosticReport.result` link).
 * @param performerDisplay - The performing lab/clinician name to copy from the report, if any.
 * @param effectiveDateTime - The report's effective date/time, applied when the observation has none.
 * @returns A preliminary Observation.
 */
function buildObservation(
  extracted: ExtractedObservation,
  id: string,
  performerDisplay: string | undefined,
  effectiveDateTime: string | undefined
): Observation {
  const observation: Observation = {
    resourceType: 'Observation',
    id,
    status: 'preliminary',
    code: extracted.loincCode
      ? {
          coding: [{ system: LOINC, code: extracted.loincCode, display: extracted.display }],
          text: extracted.display,
        }
      : { text: extracted.display },
  };

  if (typeof extracted.value === 'number') {
    observation.valueQuantity = {
      value: extracted.value,
      unit: extracted.unit,
      system: extracted.unit ? UCUM : undefined,
      code: extracted.unit,
    };
  } else if (extracted.valueString) {
    observation.valueString = extracted.valueString;
  }

  if (extracted.interpretationCode) {
    observation.interpretation = [
      { coding: [{ system: OBSERVATION_INTERPRETATION, code: extracted.interpretationCode }] },
    ];
  }

  const range = buildReferenceRange(extracted.referenceRange, extracted.unit);
  if (range) {
    observation.referenceRange = [range];
  }

  if (performerDisplay) {
    observation.performer = [{ display: performerDisplay }];
  }
  if (effectiveDateTime) {
    observation.effectiveDateTime = effectiveDateTime;
  }

  return observation;
}

/**
 * Builds an {@link ObservationReferenceRange} from an extracted range, or undefined if the range
 * carries no usable information.
 *
 * @param range - The extracted reference range.
 * @param fallbackUnit - The observation's unit, used when the range does not specify one.
 * @returns The FHIR reference range, or undefined.
 */
function buildReferenceRange(
  range: ExtractedReferenceRange | undefined,
  fallbackUnit: string | undefined
): ObservationReferenceRange | undefined {
  if (!range) {
    return undefined;
  }
  const unit = range.unit ?? fallbackUnit;
  const result: ObservationReferenceRange = {};
  if (typeof range.low === 'number') {
    result.low = { value: range.low, unit, system: unit ? UCUM : undefined, code: unit };
  }
  if (typeof range.high === 'number') {
    result.high = { value: range.high, unit, system: unit ? UCUM : undefined, code: unit };
  }
  if (range.text) {
    result.text = range.text;
  }
  return result.low || result.high || result.text ? result : undefined;
}
