import { isStringArray } from './utils';

export const SEGMENT_SEPARATOR = '\r';
export const FIELD_SEPARATOR = '|';
export const COMPONENT_SEPARATOR = '^';

/**
 * The Hl7Message class represents one HL7 message.
 * A message is a collection of segments.
 * Note that we do not strictly parse messages, and only use default delimeters.
 */
export class Hl7Message {
  readonly segments: Hl7Segment[];

  constructor(segments: Hl7Segment[]) {
    this.segments = segments;
  }

  get(index: number | string): Hl7Segment | undefined {
    if (typeof index === 'number') {
      return this.segments[index];
    }
    return this.segments.find((s) => s.name === index);
  }

  getAll(name: string): Hl7Segment[] {
    return this.segments.filter((s) => s.name === name);
  }

  toString(): string {
    return this.segments.map((s) => s.toString()).join(SEGMENT_SEPARATOR);
  }

  buildAck(): Hl7Message {
    const now = new Date();
    const msh = this.get('MSH');
    const sendingApp = msh?.get(2)?.toString() || '';
    const sendingFacility = msh?.get(3)?.toString() || '';
    const receivingApp = msh?.get(4)?.toString() || '';
    const receivingFacility = msh?.get(5)?.toString() || '';
    const controlId = msh?.get(9)?.toString() || '';
    const versionId = msh?.get(12)?.toString() || '2.5.1';

    return new Hl7Message([
      new Hl7Segment([
        'MSH',
        '^~\\&',
        receivingApp,
        receivingFacility,
        sendingApp,
        sendingFacility,
        now.toISOString(),
        '',
        'ACK',
        now.getTime().toString(),
        'P',
        versionId,
      ]),
      new Hl7Segment(['MSA', 'AA', controlId, 'OK']),
    ]);
  }

  static parse(text: string): Hl7Message {
    if (!text.startsWith('MSH|^~\\&')) {
      const err = new Error('Invalid HL7 message');
      (err as any).type = 'entity.parse.failed';
      throw err;
    }
    return new Hl7Message(text.split(/[\r\n]+/).map((line) => Hl7Segment.parse(line)));
  }
}

/**
 * The Hl7Segment class represents one HL7 segment.
 * A segment is a collection of fields.
 * The name field is the first field.
 * Note that we do not strictly parse messages, and only use default delimeters.
 */
export class Hl7Segment {
  readonly name: string;
  readonly fields: Hl7Field[];

  constructor(fields: Hl7Field[] | string[]) {
    if (isStringArray(fields)) {
      this.fields = fields.map((f) => Hl7Field.parse(f));
    } else {
      this.fields = fields;
    }
    this.name = this.fields[0].components[0];
  }

  get(index: number): Hl7Field {
    return this.fields[index];
  }

  toString(): string {
    return this.fields.map((f) => f.toString()).join(FIELD_SEPARATOR);
  }

  static parse(text: string): Hl7Segment {
    return new Hl7Segment(text.split(FIELD_SEPARATOR).map((f) => Hl7Field.parse(f)));
  }
}

/**
 * The Hl7Field class represents one HL7 field.
 * A field is a collection of components.
 * Note that we do not strictly parse messages, and only use default delimeters.
 */
export class Hl7Field {
  readonly components: string[];

  constructor(components: string[]) {
    this.components = components;
  }

  get(index: number): string {
    return this.components[index];
  }

  toString(): string {
    return this.components.join(COMPONENT_SEPARATOR);
  }

  static parse(text: string): Hl7Field {
    return new Hl7Field(text.split(COMPONENT_SEPARATOR));
  }
}
