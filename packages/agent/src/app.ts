import {
  AgentMessage,
  AgentTransmitRequest,
  ContentType,
  Hl7Message,
  MedplumClient,
  normalizeErrorString,
} from '@medplum/core';
import { AgentChannel, Endpoint, Reference } from '@medplum/fhirtypes';
import { Hl7Client } from '@medplum/hl7';
import { EventLogger } from 'node-windows';
import WebSocket from 'ws';
import { Channel } from './channel';
import { AgentDicomChannel } from './dicom';
import { AgentHl7Channel } from './hl7';

export class App {
  static instance: App;
  readonly log: EventLogger;
  readonly webSocket: WebSocket;
  readonly webSocketQueue: AgentMessage[] = [];
  readonly channels = new Map<string, Channel>();
  readonly hl7Queue: AgentMessage[] = [];
  live = false;

  constructor(
    readonly medplum: MedplumClient,
    readonly agentId: string
  ) {
    App.instance = this;

    this.log = {
      info: console.log,
      warn: console.warn,
      error: console.error,
    } as EventLogger;

    const webSocketUrl = new URL(medplum.getBaseUrl());
    webSocketUrl.protocol = webSocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    webSocketUrl.pathname = '/ws/agent';
    this.log.info(`Connecting to WebSocket: ${webSocketUrl.href}`);

    this.webSocket = new WebSocket(webSocketUrl);
    this.webSocket.binaryType = 'nodebuffer';
    this.webSocket.addEventListener('error', (err) => this.log.error(err.message));
    this.webSocket.addEventListener('open', () => {
      this.sendToWebSocket({
        type: 'agent:connect:request',
        accessToken: medplum.getAccessToken() as string,
        agentId,
      });
    });

    this.webSocket.addEventListener('message', (e) => {
      try {
        const data = e.data as Buffer;
        const str = data.toString('utf8');
        this.log.info(`Received from WebSocket: ${str.replaceAll('\r', '\n')}`);
        const command = JSON.parse(str) as AgentMessage;
        switch (command.type) {
          // @ts-expect-error - Deprecated message type
          case 'connected':
          case 'agent:connect:response':
            this.live = true;
            this.trySendToWebSocket();
            break;
          // @ts-expect-error - Deprecated message type
          case 'transmit':
          case 'agent:transmit:response':
            this.addToHl7Queue(command);
            break;
          // @ts-expect-error - Deprecated message type
          case 'push':
          case 'agent:transmit:request':
            this.pushMessage(command);
            break;
          default:
            this.log.error(`Unknown message type: ${command.type}`);
        }
      } catch (err) {
        this.log.error(`WebSocket error: ${normalizeErrorString(err)}`);
      }
    });
  }

  async start(): Promise<void> {
    this.log.info('Medplum service starting...');

    const agent = await this.medplum.readResource('Agent', this.agentId);

    for (const definition of agent.channel as AgentChannel[]) {
      const endpoint = await this.medplum.readReference(definition.endpoint as Reference<Endpoint>);
      let channel: Channel | undefined = undefined;

      if (!endpoint.address) {
        this.log.warn(`Ignoring empty endpoint address: ${definition.name}`);
      } else if (endpoint.address.startsWith('dicom')) {
        channel = new AgentDicomChannel(this, definition, endpoint);
      } else if (endpoint.address.startsWith('mllp')) {
        channel = new AgentHl7Channel(this, definition, endpoint);
      } else {
        this.log.error(`Unsupported endpoint type: ${endpoint.address}`);
      }

      if (channel) {
        channel.start();
        this.channels.set(definition.name as string, channel);
      }
    }

    this.log.info('Medplum service started successfully');
  }

  stop(): void {
    this.log.info('Medplum service stopping...');
    this.channels.forEach((channel) => channel.stop());
    this.log.info('Medplum service stopped successfully');
  }

  addToWebSocketQueue(message: AgentMessage): void {
    this.webSocketQueue.push(message);
    this.trySendToWebSocket();
  }

  addToHl7Queue(message: AgentMessage): void {
    this.hl7Queue.push(message);
    this.trySendToHl7Connection();
  }

  private trySendToWebSocket(): void {
    if (this.live) {
      while (this.webSocketQueue.length > 0) {
        const msg = this.webSocketQueue.shift();
        if (msg) {
          this.sendToWebSocket(msg);
        }
      }
    }
  }

  private trySendToHl7Connection(): void {
    while (this.hl7Queue.length > 0) {
      const msg = this.hl7Queue.shift();
      if (msg && msg.type === 'agent:transmit:response' && msg.channel) {
        const channel = this.channels.get(msg.channel);
        if (channel) {
          channel.sendToRemote(msg);
        }
      }
    }
  }

  private sendToWebSocket(message: AgentMessage): void {
    this.webSocket.send(JSON.stringify(message));
  }

  private pushMessage(message: AgentTransmitRequest): void {
    if (!message.remote) {
      this.log.error('Missing remote address');
      return;
    }

    const address = new URL(message.remote);
    const client = new Hl7Client({
      host: address.hostname,
      port: parseInt(address.port, 10),
    });

    client
      .sendAndWait(Hl7Message.parse(message.body))
      .then((response) => {
        this.log.info(`Response: ${response.toString().replaceAll('\r', '\n')}`);
        this.addToWebSocketQueue({
          type: 'agent:transmit:response',
          channel: message.channel,
          remote: message.remote,
          callback: message.callback,
          contentType: ContentType.HL7_V2,
          body: response.toString(),
        });
      })
      .catch((err) => {
        this.log.error(`HL7 error: ${normalizeErrorString(err)}`);
      })
      .finally(() => {
        client.close();
      });
  }
}
