// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message } from '@medplum/core';
import { Hl7Connection } from './connection';

export class Hl7MessageEvent extends Event {
  readonly connection: Hl7Connection;
  readonly message: Hl7Message;

  constructor(connection: Hl7Connection, message: Hl7Message) {
    super('message');
    this.connection = connection;
    this.message = message;
  }
}

export class Hl7ErrorEvent extends Event {
  readonly error: Error;

  constructor(error: Error) {
    super('error');
    this.error = error;
  }
}

export class Hl7CloseEvent extends Event {
  constructor() {
    super('close');
  }
}
