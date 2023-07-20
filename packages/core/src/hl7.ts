import { isStringArray } from './utils';

/**
 * The Hl7Context class represents the parsing context for an HL7 message.
 *
 * MSH-1:
 * https://hl7-definition.caristix.com/v2/HL7v2.6/Fields/MSH.1
 *
 * MSH-2:
 * https://hl7-definition.caristix.com/v2/HL7v2.6/Fields/MSH.2
 *
 * See this tutorial on MSH, and why it's a bad idea to use anything other than the default values:
 * https://www.hl7soup.com/HL7TutorialMSH.html
 */
export class Hl7Context {
  constructor(
    public readonly segmentSeparator = '\r',
    public readonly fieldSeparator = '|',
    public readonly componentSeparator = '^',
    public readonly repetitionSeparator = '~',
    public readonly escapeCharacter = '\\',
    public readonly subcomponentSeparator = '&'
  ) {}

  /**
   * Returns the MSH-2 field value based on the configured separators.
   * @returns The HL7 MSH-2 field value.
   */
  getMsh2(): string {
    return (
      this.fieldSeparator +
      this.componentSeparator +
      this.repetitionSeparator +
      this.escapeCharacter +
      this.subcomponentSeparator
    );
  }
}

/**
 * The Hl7Message class represents one HL7 message.
 * A message is a collection of segments.
 */
export class Hl7Message {
  readonly context: Hl7Context;
  readonly segments: Hl7Segment[];

  /**
   * Creates a new HL7 message.
   * @param segments The HL7 segments.
   * @param context Optional HL7 parsing context.
   */
  constructor(segments: Hl7Segment[], context = new Hl7Context()) {
    this.context = context;
    this.segments = segments;
  }

  /**
   * Returns the HL7 message header.
   * @returns The HL7 message header.
   */
  get header(): Hl7Segment {
    return this.segments[0];
  }

  /**
   * Returns an HL7 segment by index or by name.
   * @param index The HL7 segment index or name.
   * @returns The HL7 segment if found; otherwise, undefined.
   * @deprecated Use getSegment() instead. This method will be removed in a future release.
   */
  get(index: number | string): Hl7Segment | undefined {
    return this.getSegment(index);
  }

  /**
   * Returns all HL7 segments of a given name.
   * @param name The HL7 segment name.
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
   * @param index The HL7 segment index or name.
   * @returns The HL7 segment if found; otherwise, undefined.
   */
  getSegment(index: number | string): Hl7Segment | undefined {
    if (typeof index === 'number') {
      return this.segments[index];
    }
    return this.segments.find((s) => s.name === index);
  }

  /**
   * Returns all HL7 segments of a given name.
   * @param name The HL7 segment name.
   * @returns An array of HL7 segments with the specified name.
   */
  getAllSegments(name: string): Hl7Segment[] {
    return this.segments.filter((s) => s.name === name);
  }

  /**
   * Returns the HL7 message as a string.
   * @returns The HL7 message as a string.
   */
  toString(): string {
    return this.segments.map((s) => s.toString()).join(this.context.segmentSeparator);
  }

  /**
   * Returns an HL7 "ACK" (acknowledgement) message for this message.
   * @returns The HL7 "ACK" message.
   */
  buildAck(): Hl7Message {
    const now = new Date();
    const msh = this.getSegment('MSH');
    const sendingApp = msh?.getField(3)?.toString() ?? '';
    const sendingFacility = msh?.getField(4)?.toString() ?? '';
    const receivingApp = msh?.getField(5)?.toString() ?? '';
    const receivingFacility = msh?.getField(6)?.toString() ?? '';
    const controlId = msh?.getField(10)?.toString() ?? '';
    const versionId = msh?.getField(12)?.toString() ?? '2.5.1';

    return new Hl7Message([
      new Hl7Segment(
        [
          'MSH',
          this.context.getMsh2(),
          receivingApp,
          receivingFacility,
          sendingApp,
          sendingFacility,
          now.toISOString(),
          '',
          this.buildAckMessageType(msh),
          now.getTime().toString(),
          'P',
          versionId,
        ],
        this.context
      ),
      new Hl7Segment(['MSA', 'AA', controlId, 'OK'], this.context),
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
   * @param text The HL7 message text.
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
    return new Hl7Message(
      text.split(/[\r\n]+/).map((line) => Hl7Segment.parse(line, context)),
      context
    );
  }
}

/**
 * The Hl7Segment class represents one HL7 segment.
 * A segment is a collection of fields.
 * The name field is the first field.
 */
export class Hl7Segment {
  readonly context: Hl7Context;
  readonly name: string;
  readonly fields: Hl7Field[];

  /**
   * Creates a new HL7 segment.
   * @param fields The HL7 fields. The first field is the segment name.
   * @param context Optional HL7 parsing context.
   */
  constructor(fields: Hl7Field[] | string[], context = new Hl7Context()) {
    this.context = context;
    if (isStringArray(fields)) {
      this.fields = fields.map((f) => Hl7Field.parse(f, context));
    } else {
      this.fields = fields;
    }
    this.name = this.fields[0].components[0][0];
  }

  /**
   * Returns an HL7 field by index.
   * @param index The HL7 field index.
   * @returns The HL7 field.
   * @deprecated Use getSegment() instead. This method includes the segment name in the index, which leads to confusing behavior. This method will be removed in a future release.
   */
  get(index: number): Hl7Field {
    return this.fields[index];
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
   * @param index The HL7 field index.
   * @returns The HL7 field.
   */
  getField(index: number): Hl7Field {
    if (this.name === 'MSH') {
      // MSH segments require special handling due to field separator
      if (index === 1) {
        // MSH.1 is the field separator
        return Hl7Field.parse(this.context.fieldSeparator, this.context);
      }
      if (index > 1) {
        // MSH.2 through MSH.n are offset by 1
        return this.fields[index - 1];
      }
    }
    return this.fields[index];
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
   * @param fieldIndex The HL7 field index.
   * @param component The component index.
   * @param subcomponent Optional subcomponent index.
   * @param repetition Optional repetition index.
   * @returns The string value of the specified component.
   */
  getComponent(fieldIndex: number, component: number, subcomponent?: number, repetition = 0): string {
    return this.getField(fieldIndex).getComponent(component, subcomponent, repetition);
  }

  /**
   * Returns the HL7 segment as a string.
   * @returns The HL7 segment as a string.
   */
  toString(): string {
    return this.fields.map((f) => f.toString()).join(this.context.fieldSeparator);
  }

  /**
   * Parses an HL7 segment string into an Hl7Segment object.
   * @param text The HL7 segment text.
   * @param context Optional HL7 parsing context.
   * @returns The parsed HL7 segment.
   */
  static parse(text: string, context = new Hl7Context()): Hl7Segment {
    return new Hl7Segment(
      text.split(context.fieldSeparator).map((f) => Hl7Field.parse(f, context)),
      context
    );
  }
}

/**
 * The Hl7Field class represents one HL7 field.
 * A field is a collection of components.
 */
export class Hl7Field {
  readonly context: Hl7Context;
  readonly components: string[][];

  /**
   * Creates a new HL7 field.
   * @param components The HL7 components.
   * @param context Optional HL7 parsing context.
   */
  constructor(components: string[][], context = new Hl7Context()) {
    this.context = context;
    this.components = components;
  }

  /**
   * Returns an HL7 component by index.
   * @param component The component index.
   * @param subcomponent Optional subcomponent index.
   * @param repetition Optional repetition index.
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
   * @param component The component index.
   * @param subcomponent Optional subcomponent index.
   * @param repetition Optional repetition index.
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
    return this.components.map((r) => r.join(this.context.componentSeparator)).join(this.context.repetitionSeparator);
  }

  /**
   * Parses an HL7 field string into an Hl7Field object.
   * @param text The HL7 field text.
   * @param context Optional HL7 parsing context.
   * @returns The parsed HL7 field.
   */
  static parse(text: string, context = new Hl7Context()): Hl7Field {
    return new Hl7Field(
      text.split(context.repetitionSeparator).map((r) => r.split(context.componentSeparator)),
      context
    );
  }
}

interface Hl7DateParseOptions {
  seconds?: boolean;
  tzOffset?: string;
}

/**
 * Returns a formatted string representing the date in ISO-8601 format.
 * @param hl7Date Date string.
 * @param options Optional configuration Object
 * @returns The date in ISO-8601 format.
 */
export function parseHl7Date(hl7Date: string | undefined, options?: Hl7DateParseOptions): string | undefined {
  if (!hl7Date) {
    return undefined;
  }

  options = { ...{ seconds: true, tzOffset: 'Z' }, ...options };

  const year = Number.parseInt(hl7Date.substring(0, 4), 10);
  const month = Number.parseInt(hl7Date.substring(4, 6), 10);
  const date = Number.parseInt(hl7Date.substring(6, 8), 10);
  const hours = Number.parseInt(hl7Date.substring(8, 10), 10);
  const minutes = Number.parseInt(hl7Date.substring(10, 12), 10);

  const seconds = options.seconds ? Number.parseInt(hl7Date.substring(12, 14), 10) : 0;

  return `${pad2(year)}-${pad2(month)}-${pad2(date)}T${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.000${
    options.tzOffset
  }`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
