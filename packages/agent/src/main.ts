import { Hl7Message, MedplumClient } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { Hl7Connection, Hl7MessageEvent, Hl7Server } from '@medplum/hl7';
import { EventLogger } from 'node-windows';
import WebSocket from 'ws';

export class App {
  readonly log: EventLogger;
  readonly server: Hl7Server;
  readonly connections: Connection[] = [];

  constructor(readonly medplum: MedplumClient, readonly bot: Bot) {
    this.log = new EventLogger({
      source: 'MedplumService',
      eventLog: 'SYSTEM',
    });

    this.server = new Hl7Server((connection) => {
      this.log.info('HL7 connection established');
      this.connections.push(new Connection(this, connection));
    });
  }

  start(): void {
    this.log.info('Medplum service starting...');
    this.server.start(56000);
    this.log.info('Medplum service started successfully');
  }

  stop(): void {
    this.log.info('Medplum service stopping...');
    for (const connection of this.connections) {
      connection.close();
    }
    this.server.stop();
    this.log.info('Medplum service stopped successfully');
  }
}

export class Connection {
  readonly webSocket: WebSocket;
  readonly webSocketQueue: Hl7Message[] = [];
  readonly hl7ConnectionQueue: Hl7Message[] = [];
  live = false;

  constructor(readonly app: App, readonly hl7Connection: Hl7Connection) {
    // Add listener immediately to handle incoming messages
    this.hl7Connection.addEventListener('message', (event) => this.handler(event));

    this.webSocket = new WebSocket('ws://localhost:8103/ws/agent');
    this.webSocket.binaryType = 'nodebuffer';
    this.webSocket.addEventListener('error', console.error);
    this.webSocket.addEventListener('open', () => {
      this.webSocket.send(
        JSON.stringify({
          type: 'connect',
          accessToken: this.app.medplum.getAccessToken(),

          // TODO: load these from config settings
          botId: '288ec966-b298-4c06-8d04-d165dc77da8e',
          projectMembershipId: '08077829-c6f9-46ed-be2c-0b4576d11097',
        })
      );
    });

    this.webSocket.addEventListener('message', (e) => {
      try {
        const data = e.data as Buffer;
        const str = data.toString('utf8');
        console.log('Received from WebSocket:', str.replaceAll('\r', '\n'));
        const command = JSON.parse(str);
        switch (command.type) {
          case 'connected':
            this.live = true;
            this.trySendToWebSocket();
            break;
          case 'transmit':
            this.hl7ConnectionQueue.push(Hl7Message.parse(command.message));
            this.trySendToHl7Connection();
            break;
        }
      } catch (err) {
        console.log('WebSocket error', err);
      }
    });
  }

  private async handler(event: Hl7MessageEvent): Promise<void> {
    try {
      console.log('Received:');
      console.log(event.message.toString().replaceAll('\r', '\n'));
      this.webSocketQueue.push(event.message);
      this.trySendToWebSocket();
    } catch (err) {
      console.log('HL7 error', err);
    }
  }

  private trySendToWebSocket(): void {
    if (this.live) {
      while (this.webSocketQueue.length > 0) {
        const msg = this.webSocketQueue.shift();
        if (msg) {
          this.webSocket.send(
            JSON.stringify({
              type: 'transmit',
              message: msg.toString(),
            })
          );
        }
      }
    }
  }

  private trySendToHl7Connection(): void {
    while (this.hl7ConnectionQueue.length > 0) {
      const msg = this.hl7ConnectionQueue.shift();
      if (msg) {
        this.hl7Connection.send(msg);
      }
    }
  }

  close(): void {
    this.hl7Connection.close();
    this.webSocket.close();
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  new App(new MedplumClient(), { resourceType: 'Bot', id: '00000000-00000000-00000000-00000000' }).start();
}
