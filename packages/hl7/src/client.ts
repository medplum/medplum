import { Hl7Message } from '@medplum/core';
import { connect } from 'node:net';
import { Hl7Base } from './base';
import { Hl7Connection } from './connection';

export interface Hl7ClientOptions {
  host: string;
  port: number;
  encoding?: string;
}

export class Hl7Client extends Hl7Base {
  options: Hl7ClientOptions;
  host: string;
  port: number;
  encoding?: string;
  connection?: Hl7Connection;

  constructor(options: Hl7ClientOptions) {
    super();
    this.options = options;
    this.host = this.options.host;
    this.port = this.options.port;
    this.encoding = this.options.encoding;
  }

  connect(): Promise<Hl7Connection> {
    if (this.connection) {
      return Promise.resolve(this.connection);
    }

    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port }, () => {
        this.connection = new Hl7Connection(socket, this.encoding);
        socket.off('error', reject);
        resolve(this.connection);
      });

      socket.on('error', reject);
    });
  }

  async send(msg: Hl7Message): Promise<void> {
    return (await this.connect()).send(msg);
  }

  async sendAndWait(msg: Hl7Message): Promise<Hl7Message> {
    return (await this.connect()).sendAndWait(msg);
  }

  close(): void {
    if (this.connection) {
      this.connection.close();
      delete this.connection;
    }
  }
}
