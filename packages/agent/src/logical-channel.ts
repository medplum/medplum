// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Hl7Message, ILogger } from '@medplum/core';

/**
 * One HL7 field path in a channel's `logicalChannelKey` spec, parsed from a token
 * like `MSH.4`, `MSH.9.2`, or `PID.3.1.2`.
 *
 * Indices are 1-based to match Medplum's HL7 accessors (`Hl7Segment.getField` /
 * `getComponent`) and the way HL7 names components — e.g. `MSH.9.2` is field 9,
 * component 2. MSH's field-separator/encoding offset is handled inside
 * `getField`, so `MSH.9` addresses the message type as a human would expect.
 */
export interface LogicalChannelField {
  /** The token exactly as written (e.g. `MSH.9.2`); used verbatim as the key label. */
  label: string;
  /** Segment name (e.g. `MSH`, `PID`). */
  segment: string;
  /** 1-based field index. */
  field: number;
  /** 1-based component index, if the token addressed a component. */
  component?: number;
  /** 1-based subcomponent index, if the token addressed a subcomponent. */
  subcomponent?: number;
}

// HL7 segment names are three characters: a letter followed by two alphanumerics
// (e.g. MSH, PID, ZAB for a Z-segment). This is the same shape Hl7Message keys on.
const SEGMENT_RE = /^[A-Z][A-Z0-9]{2}$/;

/**
 * Parses a `logicalChannelKey` spec into validated field paths.
 *
 * The spec is `field1-field2-...` where each field is `SEGMENT.field[.component[.subcomponent]]`
 * (e.g. `MSH.4-MSH.9.2`). `-` separates fields; HL7 field paths never contain `-`,
 * so the split is unambiguous. An empty/whitespace spec means "no partitioning"
 * and yields `[]` (the channel is a single serialized queue).
 *
 * Validation is all-or-nothing: if ANY field token is malformed the whole spec is
 * rejected (returns `undefined`) so a caller can keep the previously-applied spec
 * rather than silently partitioning on a partial/wrong key. A warning is logged
 * describing the offending token.
 * @param raw - The raw spec string (endpoint URL param or agent setting), or undefined.
 * @param logger - Logger used to warn on an invalid spec.
 * @returns The parsed field paths, `[]` for an empty spec, or `undefined` if the spec is invalid.
 */
export function parseLogicalChannelKeySpec(
  raw: string | undefined,
  logger: ILogger
): LogicalChannelField[] | undefined {
  const spec = (raw ?? '').trim();
  if (spec === '') {
    return [];
  }
  const fields: LogicalChannelField[] = [];
  for (const token of spec.split('-')) {
    const parsed = parseLogicalChannelField(token.trim());
    if (!parsed) {
      logger.warn(
        `Invalid logicalChannelKey field '${token}' in spec '${raw}'; ` +
          `expected SEGMENT.field[.component[.subcomponent]] (e.g. 'MSH.4-MSH.9.2'). Ignoring the spec.`
      );
      return undefined;
    }
    fields.push(parsed);
  }
  return fields;
}

/**
 * Parses a single `SEGMENT.field[.component[.subcomponent]]` token.
 * @param token - The field token to parse.
 * @returns The parsed field path, or undefined if the token is malformed.
 */
function parseLogicalChannelField(token: string): LogicalChannelField | undefined {
  if (!token) {
    return undefined;
  }
  const parts = token.split('.');
  // segment + field are required; component + subcomponent are optional.
  if (parts.length < 2 || parts.length > 4) {
    return undefined;
  }
  const [segment, fieldStr, componentStr, subcomponentStr] = parts;
  if (!SEGMENT_RE.test(segment)) {
    return undefined;
  }
  const field = parsePositiveInt(fieldStr);
  if (field === undefined) {
    return undefined;
  }
  let component: number | undefined;
  if (componentStr !== undefined) {
    component = parsePositiveInt(componentStr);
    if (component === undefined) {
      return undefined;
    }
  }
  let subcomponent: number | undefined;
  if (subcomponentStr !== undefined) {
    subcomponent = parsePositiveInt(subcomponentStr);
    if (subcomponent === undefined) {
      return undefined;
    }
  }
  return { label: token, segment, field, component, subcomponent };
}

/**
 * Parses a strictly-positive 1-based index. Rejects non-digits, 0, and anything
 * with a sign/decimal so a typo (`MSH.0`, `MSH.-1`, `MSH.x`) fails validation
 * rather than silently addressing the wrong thing.
 * @param value - The candidate index string.
 * @returns The parsed integer (>= 1), or undefined if invalid.
 */
function parsePositiveInt(value: string): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const n = Number.parseInt(value, 10);
  return n >= 1 ? n : undefined;
}

/**
 * Computes a message's logical-channel key from a parsed spec.
 *
 * The key is `label:value-label:value-...`, one segment per spec field, in spec
 * order — e.g. spec `MSH.4-MSH.9.2` over a message from `HOSP1` of type `A01`
 * yields `MSH.4:HOSP1-MSH.9.2:A01`. The key is only ever compared for string
 * equality (it partitions the queue; it is never parsed back), and each field's
 * value is escaped ({@link escapeKeyPart}) so the `:`/`-` delimiters can't be
 * forged: two messages collide iff every addressed field is identical. (Labels
 * come from the spec and can contain neither delimiter, so they need no escaping.)
 * Without escaping, distinct tuples could concatenate to the same key — e.g. spec
 * `MSH.4-MSH.6` with `MSH.4='X-MSH.6:Y', MSH.6='Z'` vs `MSH.4='X', MSH.6='Y-MSH.6:Z'`
 * — silently merging unrelated senders into one partition. A missing segment/field
 * contributes an empty value, so messages lacking the keyed field group together.
 *
 * An empty spec returns `''` — the single-queue default.
 * @param message - The parsed HL7 message.
 * @param spec - The parsed field paths (from {@link parseLogicalChannelKeySpec}).
 * @returns The logical-channel key for this message.
 */
export function computeLogicalChannelKey(message: Hl7Message, spec: LogicalChannelField[]): string {
  if (spec.length === 0) {
    return '';
  }
  return spec.map((f) => `${f.label}:${escapeKeyPart(extractFieldValue(message, f))}`).join('-');
}

/**
 * Escapes the key delimiters in a field value so distinct field tuples can never
 * concatenate to the same key. Backslash is escaped first (so it can serve as the
 * escape character), then the `:` (label/value) and `-` (field) separators.
 * @param value - The raw field value.
 * @returns The value with `\`, `:`, and `-` backslash-escaped.
 */
function escapeKeyPart(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/-/g, '\\-');
}

/**
 * Extracts the string value a field path addresses, or `''` when the segment,
 * field, or component is absent.
 * @param message - The parsed HL7 message.
 * @param field - The field path to extract.
 * @returns The addressed value, or an empty string if not present.
 */
function extractFieldValue(message: Hl7Message, field: LogicalChannelField): string {
  const segment = message.getSegment(field.segment);
  if (!segment) {
    return '';
  }
  if (field.component === undefined) {
    return segment.getField(field.field)?.toString() ?? '';
  }
  // Hl7Segment.getComponent(fieldIndex, component, subcomponent?, repetition?):
  // fieldIndex and component are 1-based, but its `subcomponent` arg is 0-based,
  // so convert our 1-based subcomponent. Returns '' when the path is absent.
  return segment.getComponent(
    field.field,
    field.component,
    field.subcomponent === undefined ? undefined : field.subcomponent - 1
  );
}
