import { Hl7Message } from '@medplum/core';
import { Hl7Connection } from './connection';

export class Hl7MessageEvent extends Event {
  constructor(
    public readonly connection: Hl7Connection,
    public readonly message: Hl7Message
  ) {
    super('message');
  }
}

export class Hl7ErrorEvent extends Event {
  constructor(public readonly error: Error) {
    super('error');
  }
}

export class Hl7CloseEvent extends Event {
  constructor() {
    super('close');
  }
}
