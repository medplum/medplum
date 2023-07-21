import { Hl7Message } from '@medplum/core';
import { Socket } from 'net';
import { CR, FS, VT } from './constants';

export class Hl7MessageEvent extends Event {
  constructor(public readonly socket: Socket, public readonly message: Hl7Message) {
    super('message');
  }

  send(reply: Hl7Message): void {
    this.socket.write(VT + reply.toString() + FS + CR);
  }
}

export class Hl7ErrorEvent extends Event {
  constructor(public readonly error: Error) {
    super('error');
  }
}
