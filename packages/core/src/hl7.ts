// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export const AckCode = {
  /** AA - Application Accept */
  AA: 'AA',
  /** AE - Application Error */
  AE: 'AE',
  /** AR - Application Reject */
  AR: 'AR',
  /** CA - Commit Accept */
  CA: 'CA',
  /** CE - Commit Error */
  CE: 'CE',
  /** CR - Commit Reject */
  CR: 'CR',
} as const;
export type AckCode = keyof typeof AckCode;

export interface Hl7AckOptions {
  ackCode: AckCode;
  errSegment?: Hl7Segment;
}

const TEXT_MSG_FOR_ACK_CODE = {
  AA: 'OK',
  AE: 'Application Error',
  AR: 'Application Reject',
  CA: 'Commit Accept',
  CE: 'Commit Error',
  CR: 'Commit Reject',
};

/**
 * The Hl7Context class represents the parsing context for an HL7 message.
 *
 * @see MSH-1: https://hl7-definition.caristix.com/v2/HL7v2.6/Fields/MSH.1
 * @see MSH-2: https://hl7-definition.caristix.com/v2/HL7v2.6/Fields/MSH.2
 * @see See this tutorial on MSH, and why it's a bad idea to use anything other than the default values: https://www.hl7soup.com/HL7TutorialMSH.html
 */
export class Hl7Context {
  readonly segmentSeparator: string;
  readonly fieldSeparator: string;
  readonly componentSeparator: string;
  readonly repetitionSeparator: string;
  readonly escapeCharacter: string;
  readonly subcomponentSeparator: string;

  constructor(
    segmentSeparator = '\r',
    fieldSeparator = '|',
    componentSeparator = '^',
    repetitionSeparator = '~',
    escapeCharacter = '\\',
    subcomponentSeparator = '&'
  ) {
    this.segmentSeparator = segmentSeparator;
    this.fieldSeparator = fieldSeparator;
    this.componentSeparator = componentSeparator;
    this.repetitionSeparator = repetitionSeparator;
    this.escapeCharacter = escapeCharacter;
    this.subcomponentSeparator = subcomponentSeparator;
  }

  /**
   * Returns the MSH-1 field value based on the configured separators.
   * @returns The HL7 MSH-1 field value.
   */
  getMsh1(): string {
    return this.fieldSeparator;
  }

  /**
   * Returns the MSH-2 field value based on the configured separators.
   * @returns The HL7 MSH-2 field value.
   */
  getMsh2(): string {
    return this.componentSeparator + this.repetitionSeparator + this.escapeCharacter + this.subcomponentSeparator;
  }
}

/**
 * The Hl7Message class represents one HL7 message.
 * A message is a collection of segments.
 */
export class Hl7Message {
  readonly context: Hl7Context;
  /**
   * Internal lazy-parsed segment storage. Entries are `string` until they
   * are accessed (via {@link getSegment}, {@link getAllSegments}, {@link header},
   * or the public {@link segments} getter), at which point they are parsed in
   * place and replaced with their {@link Hl7Segment} form.
   */
  private readonly _segments: (Hl7Segment | string)[];
  /**
   * Maps segment name → indices into {@link _segments}. Storing indices (rather
   * than references to the segments themselves) keeps this map in sync with
   * {@link _segments} without needing a per-parse update step, and is immune to
   * collisions when two segments have identical raw text.
   */
  private segmentsByName: Map<string, number[]>;
  private cachedString: string | undefined;
  /** Becomes true once every entry in `_segments` has been parsed. */
  private allSegmentsParsed: boolean;

  /**
   * Creates a new HL7 message.
   *
   * Segment strings are not parsed until they are accessed via {@link getSegment},
   * {@link getAllSegments}, {@link header}, or the {@link segments} getter.
   *
   * @param segments - The HL7 segments.
   * @param context - Optional HL7 parsing context.
   */
  constructor(segments: (Hl7Segment | string)[], context = new Hl7Context()) {
    this.context = context;
    this._segments = segments;
    this.segmentsByName = buildSegmentMap(segments);
    this.allSegmentsParsed = segments.every((s) => typeof s !== 'string');
    this.bindSegments();
  }

  /**
   * Returns all HL7 segments, parsing any unparsed segment strings on first access.
   *
   * Prefer {@link getSegment} or {@link getAllSegments} when you only need a subset
   * of segments; those methods avoid parsing unrelated segments.
   *
   * @returns The HL7 segments array.
   */
  get segments(): Hl7Segment[] {
    if (!this.allSegmentsParsed) {
      for (let i = 0; i < this._segments.length; i++) {
        if (typeof this._segments[i] === 'string') {
          this.parseSegment(i);
        }
      }
      this.allSegmentsParsed = true;
    }
    return this._segments as Hl7Segment[];
  }

  /**
   * Returns the HL7 message header.
   * @returns The HL7 message header.
   */
  get header(): Hl7Segment {
    const headerSegment = this.parseSegment(0);
    if (!headerSegment) {
      throw new Error("Can't get header before first segment added");
    }
    return headerSegment;
  }

  /**
   * Returns an HL7 segment by index or by name.
   * @param index - The HL7 segment index or name.
   * @returns The HL7 segment if found; otherwise, undefined.
   * @deprecated Use getSegment() instead. This method will be removed in a future release.
   */
  get(index: number | string): Hl7Segment | undefined {
    return this.getSegment(index);
  }

  /**
   * Returns all HL7 segments of a given name.
   * @param name - The HL7 segment name.
   * @returns An array of HL7 segments with the specified name.
   * @deprecated Use getAllSegments() instead. This method will be removed in a future release.
   */
  getAll(name: string): Hl7Segment[] {
    return this.getAllSegments(name);
  }

  /**
   * Returns an HL7 segment by index or by name.
   *
   * When using a numeric index, the first segment (usually the MSH header segment) is at index 0.
   *
   * When using a string index, this method returns the first segment with the specified name.
   *
   * Segments are lazily parsed; the requested segment is parsed and cached on demand.
   *
   * @param index - The HL7 segment index or name.
   * @returns The HL7 segment if found; otherwise, undefined.
   */
  getSegment(index: number | string): Hl7Segment | undefined {
    if (typeof index === 'number') {
      return this.parseSegment(index);
    }
    const indices = this.segmentsByName.get(index);
    if (!indices?.length) {
      return undefined;
    }
    return this.parseSegment(indices[0]);
  }

  /**
   * Returns all HL7 segments of a given name.
   *
   * Only the segments that match the requested name are parsed, which avoids parsing
   * unrelated segments when scanning a message.
   *
   * @param name - The HL7 segment name.
   * @returns An array of HL7 segments with the specified name.
   */
  getAllSegments(name: string): Hl7Segment[] {
    const indices = this.segmentsByName.get(name);
    if (!indices) {
      return [];
    }
    return indices.map((i) => this.parseSegment(i) as Hl7Segment);
  }

  /**
   * Parses the segment at the given index (if not already parsed), caches it back into
   * the segments array, and wires up the onModified callback.
   * @param index - The HL7 segment index.
   * @returns The parsed HL7 segment, or undefined if the index is out of range.
   */
  private parseSegment(index: number): Hl7Segment | undefined {
    const raw = this._segments[index];
    if (raw === undefined) {
      return undefined;
    }
    if (typeof raw !== 'string') {
      return raw;
    }
    const parsed = Hl7Segment.parse(raw, this.context);
    parsed.onModified = () => {
      this.cachedString = undefined;
    };
    this._segments[index] = parsed;
    return parsed;
  }

  /**
   * Returns the HL7 message as a string.
   *
   * Unparsed segments are emitted directly from their original string form, which
   * preserves the source text without forcing a parse.
   *
   * @returns The HL7 message as a string.
   */
  toString(): string {
    this.cachedString ??= this._segments
      .map((s) => (typeof s === 'string' ? s : s.toString()))
      .join(this.context.segmentSeparator);
    return this.cachedString;
  }

  /**
   * Returns an HL7 "ACK" (acknowledgement) message for this message.
   * @param options - The optional options to configure the "ACK" message.
   * @returns The HL7 "ACK" message.
   */
  buildAck(options?: Hl7AckOptions): Hl7Message {
    const now = new Date();
    const msh = this.getSegment('MSH');
    const sendingApp = msh?.getField(3)?.toString() ?? '';
    const sendingFacility = msh?.getField(4)?.toString() ?? '';
    const receivingApp = msh?.getField(5)?.toString() ?? '';
    const receivingFacility = msh?.getField(6)?.toString() ?? '';
    const controlId = msh?.getField(10)?.toString() ?? '';
    const versionId = msh?.getField(12)?.toString() ?? '2.5.1';
    const ackCode = options?.ackCode ?? 'AA';

    return new Hl7Message([
      new Hl7Segment(
        [
          'MSH',
          this.context.getMsh2(),
          receivingApp,
          receivingFacility,
          sendingApp,
          sendingFacility,
          formatHl7DateTime(now),
          '',
          this.buildAckMessageType(msh),
          now.getTime().toString(),
          'P',
          versionId,
        ],
        this.context
      ),
      new Hl7Segment(['MSA', ackCode, controlId, TEXT_MSG_FOR_ACK_CODE[ackCode]], this.context),
      ...(options?.errSegment ? [options.errSegment] : []),
    ]);
  }

  private buildAckMessageType(msh: Hl7Segment | undefined): string {
    // MSH 7 is the message type
    // https://hl7-definition.caristix.com/v2/HL7v2.4/DataTypes/MSG
    // In HL7 v2.1, the message type is a single field
    // In HL7 v2.2 through v2.3, message type has two components.
    // In HL7 v2.3.1 and later, message type has three components.
    // Rather than using version to determine behavior, we instead mirror the original message.
    const messageType = msh?.getField(9);
    const triggerEvent = messageType?.getComponent(2);
    const messageStructure = messageType?.getComponent(3);
    let result = 'ACK';
    if (triggerEvent && messageStructure) {
      result = `ACK^${triggerEvent}^ACK`;
    } else if (triggerEvent) {
      result = `ACK^${triggerEvent}`;
    }
    return result;
  }

  /**
   * Parses an HL7 message string into an Hl7Message object.
   * @param text - The HL7 message text.
   * @returns The parsed HL7 message.
   */
  static parse(text: string): Hl7Message {
    if (!text.startsWith('MSH')) {
      const err = new Error('Invalid HL7 message');
      (err as any).type = 'entity.parse.failed';
      throw err;
    }
    const context = new Hl7Context(
      '\r',
      text.charAt(3), // Field separator, recommended "|"
      text.charAt(4), // Component separator, recommended "^"
      text.charAt(5), // Repetition separator, recommended "~"
      text.charAt(6), // Escape character, recommended "\"
      text.charAt(7) // Subcomponent separator, recommended "&"
    );
    const msg = new Hl7Message(text.split(/[\r\n]+/), context);
    msg.cachedString = text;
    return msg;
  }

  /**
   * Sets or replaces a segment at the specified index.
   * Only allows MSH header to be replaced as first segment.
   * If index is a number and is larger than the length of the segments array, it will be appended as the last segment.
   * If the index is a string, replaces the first segment with that name.
   * @param index - The segment index or name
   * @param segment - The new segment to set
   * @returns true if the segment was set, false otherwise
   */
  setSegment(index: number | string, segment: Hl7Segment): boolean {
    // Special handling for MSH segment
    if (segment.name === 'MSH') {
      if (typeof index === 'number') {
        if (index !== 0) {
          return false; // MSH can only be the first segment
        }
      } else {
        const existingIndex = this.findSegmentIndexByName(index);
        if (existingIndex !== 0) {
          return false; // MSH can only be the first segment
        }
      }
    } else if (typeof index === 'number' && index === 0 && segment.name !== 'MSH') {
      return false; // Cannot replace MSH segment with non-MSH segment
    }

    if (typeof index === 'number') {
      if (index >= this._segments.length) {
        // Append as last segment
        this._segments.push(segment);
        this.invalidateCache();
        return true;
      }
      this._segments[index] = segment;
      this.invalidateCache();
      return true;
    }

    const existingIndex = this.findSegmentIndexByName(index);
    if (existingIndex === 0 && segment.name !== 'MSH') {
      return false; // Cannot replace MSH segment with non-MSH segment
    }
    if (existingIndex !== -1) {
      this._segments[existingIndex] = segment;
      this.invalidateCache();
      return true;
    }
    return false;
  }

  private findSegmentIndexByName(name: string): number {
    return this.segmentsByName.get(name)?.[0] ?? -1;
  }

  private invalidateCache(): void {
    this.segmentsByName = buildSegmentMap(this._segments);
    this.cachedString = undefined;
    this.bindSegments();
    // NOTE: We don't clear allSegmentsParsed here because beyond this point all new segments have to be `Hl7Segment` types, not strings
  }

  private bindSegments(): void {
    const callback = (): void => {
      this.cachedString = undefined;
    };
    for (const segment of this._segments) {
      if (typeof segment !== 'string') {
        segment.onModified = callback;
      }
    }
  }
}

function buildSegmentMap(segments: (Hl7Segment | string)[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const name = typeof segment === 'string' ? segment.slice(0, 3) : segment.name;
    const existing = map.get(name);
    if (existing) {
      existing.push(i);
    } else {
      map.set(name, [i]);
    }
  }
  return map;
}

/**
 * The Hl7Segment class represents one HL7 segment.
 * A segment is a collection of fields.
 * The name field is the first field.
 */
export class Hl7Segment {
  readonly context: Hl7Context;
  readonly name: string;
  /**
   * Internal lazy-parsed field storage. Entries are `string` until they are
   * accessed (via {@link getField} or the public {@link fields} getter), at
   * which point they are parsed in place and replaced with their
   * {@link Hl7Field} form.
   */
  private readonly _fields: (Hl7Field | string)[];
  /** Becomes true once every entry in `_fields` has been parsed. */
  private allFieldsParsed: boolean;
  private cachedString: string | undefined;
  /** @internal */
  onModified?: () => void;

  /**
   * Creates a new HL7 segment.
   *
   * Field strings are not parsed until they are accessed via {@link getField}
   * or via the {@link fields} getter.
   *
   * @param fields - The HL7 fields. The first field is the segment name.
   * @param context - Optional HL7 parsing context.
   */
  constructor(fields: (Hl7Field | string)[], context = new Hl7Context()) {
    this.context = context;
    this._fields = fields;
    this.allFieldsParsed = fields.every((f) => typeof f !== 'string');
    const first = fields[0];
    this.name = typeof first === 'string' ? first : first.components[0][0];
    this.bindFields();
  }

  /**
   * Returns all HL7 fields, parsing any unparsed field strings on first access.
   *
   * Prefer {@link getField} when you only need a subset of fields; that method
   * avoids parsing unrelated fields.
   *
   * @returns The HL7 fields array.
   */
  get fields(): Hl7Field[] {
    if (!this.allFieldsParsed) {
      for (let i = 0; i < this._fields.length; i++) {
        if (typeof this._fields[i] === 'string') {
          this.parseField(i);
        }
      }
      this.allFieldsParsed = true;
    }
    return this._fields as Hl7Field[];
  }

  /**
   * Returns an HL7 field by index.
   * @param index - The HL7 field index.
   * @returns The HL7 field.
   * @deprecated Use getField() instead. This method includes the segment name in the index, which leads to confusing behavior. This method will be removed in a future release.
   */
  get(index: number): Hl7Field {
    return this.parseField(index) as Hl7Field;
  }

  /**
   * Returns an HL7 field by index.
   *
   * Note that the index is 1-based, not 0-based.
   *
   * For example, to get the first field, use `getField(1)`.
   *
   * This aligns with HL7 field names such as PID.1, PID.2, etc.
   *
   * Field zero is the segment name.
   *
   * Fields are lazily parsed; the requested field is parsed and cached on demand.
   *
   * @param index - The HL7 field index.
   * @returns The HL7 field.
   */
  getField(index: number): Hl7Field {
    if (this.name === 'MSH') {
      // MSH segments require special handling due to field separator
      if (index === 1) {
        // MSH.1 is the field separator
        return new Hl7Field([[this.context.getMsh1()]], this.context);
      }
      if (index === 2) {
        // MSH.2 is the encoding characters
        return new Hl7Field([[this.context.getMsh2()]], this.context);
      }
      if (index > 2) {
        // MSH.3 through MSH.n are offset by 1
        return this.parseField(index - 1) as Hl7Field;
      }
    }
    return this.parseField(index) as Hl7Field;
  }

  /**
   * Parses the field at the given index (if not already parsed), caches it back into
   * the fields array, and wires up the onModified callback.
   * @param index - The HL7 field index.
   * @returns The parsed HL7 field, or undefined if the index is out of range.
   */
  private parseField(index: number): Hl7Field | undefined {
    const raw = this._fields[index];
    if (raw === undefined) {
      return undefined;
    }
    if (typeof raw !== 'string') {
      return raw;
    }
    const parsed = Hl7Field.parse(raw, this.context);
    parsed.onModified = () => {
      this.cachedString = undefined;
      this.onModified?.();
    };
    this._fields[index] = parsed;
    return parsed;
  }

  /**
   * Returns an HL7 component by field index and component index.
   *
   * This is a shortcut for `getField(field).getComponent(component)`.
   *
   * Note that both indexex are 1-based, not 0-based.
   *
   * For example, to get the first component, use `getComponent(1, 1)`.
   *
   * This aligns with HL7 component names such as MSH.9.2.
   *
   * @param fieldIndex - The HL7 field index.
   * @param component - The component index.
   * @param subcomponent - Optional subcomponent index.
   * @param repetition - Optional repetition index.
   * @returns The string value of the specified component.
   */
  getComponent(fieldIndex: number, component: number, subcomponent?: number, repetition = 0): string {
    return this.getField(fieldIndex)?.getComponent(component, subcomponent, repetition) ?? '';
  }

  /**
   * Returns the HL7 segment as a string.
   *
   * Unparsed fields are emitted directly from their original string form, which
   * preserves the source text without forcing a parse.
   *
   * @returns The HL7 segment as a string.
   */
  toString(): string {
    this.cachedString ??= this._fields
      .map((f) => (typeof f === 'string' ? f : f.toString()))
      .join(this.context.fieldSeparator);
    return this.cachedString;
  }

  /**
   * Parses an HL7 segment string into an Hl7Segment object.
   * @param text - The HL7 segment text.
   * @param context - Optional HL7 parsing context.
   * @returns The parsed HL7 segment.
   */
  static parse(text: string, context = new Hl7Context()): Hl7Segment {
    const segment = new Hl7Segment(text.split(context.fieldSeparator), context);
    segment.cachedString = text;
    return segment;
  }

  /**
   * Sets a field at the specified index. If that index does not exist, it will be added.
   * Note that the index is 1-based, not 0-based.
   * @param index - The field index
   * @param field - The new field value
   * @returns true if the field was set, false otherwise
   */
  setField(index: number, field: Hl7Field | string): boolean {
    if (this.name === 'MSH') {
      // MSH segments require special handling
      if (index === 1) {
        // MSH.1 is the field separator - cannot be changed
        return false;
      }
      if (index === 2) {
        // MSH.2 is the encoding characters - cannot be changed
        return false;
      }
      if (index > 2) {
        // MSH.3 through MSH.n are offset by 1
        const actualIndex = index - 1;
        // Add new fields if needed
        while (this._fields.length <= actualIndex) {
          this._fields.push(new Hl7Field([['']], this.context));
        }
        this._fields[actualIndex] = typeof field === 'string' ? Hl7Field.parse(field, this.context) : field;
        this.invalidateCache();
        return true;
      }
    }

    // Add new fields if needed
    while (this._fields.length <= index) {
      this._fields.push(new Hl7Field([['']], this.context));
    }
    this._fields[index] = typeof field === 'string' ? Hl7Field.parse(field, this.context) : field;
    this.invalidateCache();
    return true;
  }

  /**
   * Sets a component value by field index and component index.
   * This is a shortcut for `getField(field).setComponent(component, value)`.
   * Note that both indices are 1-based, not 0-based.
   * @param fieldIndex - The HL7 field index
   * @param component - The component index
   * @param value - The new component value
   * @param subcomponent - Optional subcomponent index
   * @param repetition - Optional repetition index
   * @returns true if the component was set, false otherwise
   */
  setComponent(fieldIndex: number, component: number, value: string, subcomponent?: number, repetition = 0): boolean {
    const field = this.getField(fieldIndex);
    if (!field) {
      return false;
    }
    const result = field.setComponent(component, value, subcomponent, repetition);
    return result;
  }

  private invalidateCache(): void {
    this.cachedString = undefined;
    this.bindFields();
    this.onModified?.();
  }

  private bindFields(): void {
    const callback = (): void => {
      this.cachedString = undefined;
      this.onModified?.();
    };
    for (const field of this._fields) {
      if (typeof field !== 'string') {
        field.onModified = callback;
      }
    }
  }
}

/**
 * The Hl7Field class represents one HL7 field.
 * A field is a collection of components.
 */
export class Hl7Field {
  readonly context: Hl7Context;
  readonly components: string[][];
  /** @internal */
  onModified?: () => void;
  private cachedString: string | undefined;

  /**
   * Creates a new HL7 field.
   * @param components - The HL7 components.
   * @param context - Optional HL7 parsing context.
   */
  constructor(components: string[][], context = new Hl7Context()) {
    this.context = context;
    this.components = components;
  }

  /**
   * Returns an HL7 component by index.
   * @param component - The component index.
   * @param subcomponent - Optional subcomponent index.
   * @param repetition - Optional repetition index.
   * @returns The string value of the specified component.
   * @deprecated Use getComponent() instead. This method will be removed in a future release.
   */
  get(component: number, subcomponent?: number, repetition = 0): string {
    return this.getComponent(component + 1, subcomponent, repetition);
  }

  /**
   * Returns an HL7 component by index.
   *
   * Note that the index is 1-based, not 0-based.
   *
   * For example, to get the first component, use `getComponent(1)`.
   *
   * This aligns with HL7 component names such as MSH.9.2.
   *
   * @param component - The component index.
   * @param subcomponent - Optional subcomponent index.
   * @param repetition - Optional repetition index.
   * @returns The string value of the specified component.
   */
  getComponent(component: number, subcomponent?: number, repetition = 0): string {
    let value = this.components[repetition][component - 1] ?? '';

    if (subcomponent !== undefined) {
      value = value.split(this.context.subcomponentSeparator)[subcomponent] ?? '';
    }

    return value;
  }

  /**
   * Returns the HL7 field as a string.
   * @returns The HL7 field as a string.
   */
  toString(): string {
    this.cachedString ??= this.components
      .map((r) => r.join(this.context.componentSeparator))
      .join(this.context.repetitionSeparator);
    return this.cachedString;
  }

  /**
   * Parses an HL7 field string into an Hl7Field object.
   * @param text - The HL7 field text.
   * @param context - Optional HL7 parsing context.
   * @returns The parsed HL7 field.
   */
  static parse(text: string, context = new Hl7Context()): Hl7Field {
    const field = new Hl7Field(
      text.split(context.repetitionSeparator).map((r) => r.split(context.componentSeparator)),
      context
    );
    field.cachedString = text;
    return field;
  }

  /**
   * Sets a component value at the specified indices.
   * Note that the indices are 1-based, not 0-based.
   * @param component - The component index
   * @param value - The new component value
   * @param subcomponent - Optional subcomponent index
   * @param repetition - Optional repetition index
   * @returns true if the component was set, false otherwise
   */
  setComponent(component: number, value: string, subcomponent?: number, repetition = 0): boolean {
    if (component < 1) {
      return false;
    }

    if (repetition >= this.components.length) {
      // Add new repetitions if needed
      while (this.components.length <= repetition) {
        this.components.push(['']);
      }
    }

    if (subcomponent === undefined) {
      // Handle regular component setting
      this.components[repetition][component - 1] = value;
    } else if (subcomponent < 0) {
      return false;
    } else {
      // Handle subcomponent setting
      const currentValue = this.components[repetition][component - 1] || '';
      const subcomponents = currentValue.split(this.context.subcomponentSeparator);

      // Ensure we have enough subcomponents
      while (subcomponents.length <= subcomponent) {
        subcomponents.push('');
      }

      subcomponents[subcomponent] = value;
      this.components[repetition][component - 1] = subcomponents.join(this.context.subcomponentSeparator);
    }

    this.invalidateCache();
    return true;
  }

  private invalidateCache(): void {
    this.cachedString = undefined;
    this.onModified?.();
  }
}

export interface Hl7DateParseOptions {
  /**
   * Default timezone offset.
   * Example: "-0500"
   */
  tzOffset?: string;
}

/**
 * Returns a formatted string representing the date in ISO-8601 format.
 *
 * HL7-Definition V2
 * Specifies a point in time using a 24-hour clock notation.
 *
 * Format: YYYY[MM[DD[HH[MM[SS[. S[S[S[S]]]]]]]]][+/-ZZZZ].
 *
 * @param hl7DateTime - Date/time string.
 * @param options - Optional parsing options.
 * @returns The date in ISO-8601 format.
 */
export function parseHl7DateTime(hl7DateTime: string | undefined, options?: Hl7DateParseOptions): string | undefined {
  if (!hl7DateTime) {
    return undefined;
  }

  const year = parseIntOrDefault(hl7DateTime.slice(0, 4), 0);
  const month = parseIntOrDefault(hl7DateTime.slice(4, 6), 1) - 1; // Months are 0-indexed in JavaScript Date
  const day = parseIntOrDefault(hl7DateTime.slice(6, 8), 1); // Default to first day of month
  const hour = parseIntOrDefault(hl7DateTime.slice(8, 10), 0);
  const minute = parseIntOrDefault(hl7DateTime.slice(10, 12), 0);
  const second = parseIntOrDefault(hl7DateTime.slice(12, 14), 0);

  let millisecond = 0;
  if (hl7DateTime.includes('.')) {
    millisecond = parseIntOrDefault(hl7DateTime.slice(15, 19), 0);
  }

  let date = new Date(Date.UTC(year, month, day, hour, minute, second, millisecond));

  const tzOffset = parseTimeZoneOffset(hl7DateTime, options?.tzOffset);
  if (tzOffset !== 0) {
    date = new Date(date.getTime() - tzOffset);
  }

  return date.toISOString();
}

/**
 * Parses an integer value from a string.
 * @param str - The string to parse.
 * @param defaultValue - The default value to return if the string is not a number.
 * @returns The parsed integer value, or the default value if the string is not a number.
 */
function parseIntOrDefault(str: string, defaultValue: number): number {
  const result = Number.parseInt(str, 10);
  return Number.isNaN(result) ? defaultValue : result;
}

/**
 * Returns the timezone offset in milliseconds.
 * @param hl7DateTime - The HL7 date/time string.
 * @param defaultOffset - Optional default timezone offset.
 * @returns The timezone offset in milliseconds.
 */
function parseTimeZoneOffset(hl7DateTime: string, defaultOffset?: string): number {
  let offsetStr = defaultOffset;

  const plusIndex = hl7DateTime.indexOf('+');
  if (plusIndex !== -1) {
    offsetStr = hl7DateTime.slice(plusIndex);
  }

  const minusIndex = hl7DateTime.indexOf('-');
  if (minusIndex !== -1) {
    offsetStr = hl7DateTime.slice(minusIndex);
  }

  if (!offsetStr) {
    return 0;
  }

  const sign = offsetStr.startsWith('-') ? -1 : 1;

  // Remove plus, minus, and optional colon
  offsetStr = offsetStr.slice(1).replace(':', '');

  const hour = Number.parseInt(offsetStr.slice(0, 2), 10);
  const minute = Number.parseInt(offsetStr.slice(2, 4), 10);
  return sign * (hour * 60 * 60 * 1000 + minute * 60 * 1000);
}

/**
 * Formats an ISO date/time string into an HL7 date/time string.
 * @param isoDate - The ISO date/time string.
 * @returns The HL7 date/time string.
 */
export function formatHl7DateTime(isoDate: Date | string): string {
  const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
  const isoString = date.toISOString();

  // Replace "T" and all dashes (-) and colons (:) with empty strings
  // Replace Z with "+0000"
  // Replace the last 3 digits before 'Z' with the 4-digit milliseconds
  let result = isoString.replaceAll(/[-:T]/g, '').replace(/(\.\d+)?Z$/, '');

  const milliseconds = date.getUTCMilliseconds();
  if (milliseconds > 0) {
    result += '.' + milliseconds.toString();
  }

  return result;
}
