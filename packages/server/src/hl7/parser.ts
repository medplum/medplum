import { NextFunction, Request, RequestHandler, Response } from 'express';

export const SEGMENT_SEPARATOR = '\r';
export const FIELD_SEPARATOR = '|';
export const COMPONENT_SEPARATOR = '^';

export interface HL7BodyParserOptions {
  type: string[];
}

/**
 * Returns an Express middleware handler for parsing HL7 messages.
 * @param options HL7 parser options to specify content types.
 * @returns Express middleware request handler.
 */
export function hl7BodyParser(options: HL7BodyParserOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.is(options.type)) {
      req.body = Message.parse(req.body);
    }
    next();
  };
}

/**
 * The Message class represents one HL7 message.
 * A message is a collection of segments.
 * Note that we do not strictly parse messages, and only use default delimeters.
 */
export class Message {
  readonly segments: Segment[];

  constructor(segments: Segment[]) {
    this.segments = segments;
  }

  get(index: number | string): Segment | undefined {
    if (typeof index === 'number') {
      return this.segments[index];
    }
    return this.segments.find((s) => s.name === index);
  }

  getAll(name: string): Segment[] {
    return this.segments.filter((s) => s.name === name);
  }

  toString(): string {
    return this.segments.map((s) => s.toString()).join(SEGMENT_SEPARATOR);
  }

  buildAck(): Message {
    const now = new Date();
    const msh = this.get('MSH');
    const sendingApp = msh?.get(2)?.toString() || '';
    const sendingFacility = msh?.get(3)?.toString() || '';
    const receivingApp = msh?.get(4)?.toString() || '';
    const receivingFacility = msh?.get(5)?.toString() || '';
    const controlId = msh?.get(9)?.toString() || '';
    const versionId = msh?.get(12)?.toString() || '2.5.1';

    return new Message([
      new Segment([
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
      new Segment(['MSA', 'AA', controlId, 'OK']),
    ]);
  }

  static parse(text: string): Message {
    if (!text.startsWith('MSH|^~\\&')) {
      const err = new Error('Invalid HL7 message');
      (err as any).type = 'entity.parse.failed';
      throw err;
    }
    return new Message(text.split(/[\r\n]+/).map((line) => Segment.parse(line)));
  }
}

/**
 * The Segment class represents one HL7 segment.
 * A segment is a collection of fields.
 * The name field is the first field.
 * Note that we do not strictly parse messages, and only use default delimeters.
 */
export class Segment {
  readonly name: string;
  readonly fields: Field[];

  constructor(fields: Field[] | string[]) {
    if (isStringArray(fields)) {
      this.fields = fields.map((f) => Field.parse(f));
    } else {
      this.fields = fields;
    }
    this.name = this.fields[0].components[0];
  }

  get(index: number): Field {
    return this.fields[index];
  }

  toString(): string {
    return this.fields.map((f) => f.toString()).join(FIELD_SEPARATOR);
  }

  static parse(text: string): Segment {
    return new Segment(text.split(FIELD_SEPARATOR).map((f) => Field.parse(f)));
  }
}

/**
 * The Field class represents one HL7 field.
 * A field is a collection of components.
 * Note that we do not strictly parse messages, and only use default delimeters.
 */
export class Field {
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

  static parse(text: string): Field {
    return new Field(text.split(COMPONENT_SEPARATOR));
  }
}

/**
 * Returns true if the input array is an array of strings.
 * @param arr Input array.
 * @returns True if the input array is an array of strings.
 */
function isStringArray(arr: any[]): arr is string[] {
  return arr.every((e) => typeof e === 'string');
}
