import {
  AgentMessage,
  AgentTransmitRequest,
  ContentType,
  Hl7Message,
  LogLevel,
  Logger,
  MedplumClient,
  normalizeErrorString,
} from '@medplum/core';
import { Endpoint, Reference } from '@medplum/fhirtypes';
import { Hl7Client } from '@medplum/hl7';
import WebSocket from 'ws';
import { Channel } from './channel';
import { AgentDicomChannel } from './dicom';
import { AgentHl7Channel } from './hl7';

export class App {
  static instance: App;
  readonly log: Logger;
  readonly webSocketQueue: AgentMessage[] = [];
  readonly channels = new Map<string, Channel>();
  readonly hl7Queue: AgentMessage[] = [];
  healthcheckPeriod = 10 * 1000;
  private healthcheckTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private webSocket?: WebSocket;
  private webSocketWorker?: Promise<void>;
  private live = false;
  private shutdown = false;

  constructor(
    readonly medplum: MedplumClient,
    readonly agentId: string,
    readonly logLevel: LogLevel
  ) {
    App.instance = this;
    this.log = new Logger((msg) => console.log(msg), undefined, logLevel);
  }

  async start(): Promise<void> {
    this.log.info('Medplum service starting...');

    this.startWebSocket();

    await this.startListeners();

    this.medplum.addEventListener('change', () => {
      if (!this.webSocket) {
        this.connectWebSocket();
      } else {
        this.startWebSocketWorker();
      }
    });

    this.log.info('Medplum service started successfully');
  }

  private startWebSocket(): void {
    this.connectWebSocket();
    this.healthcheckTimer = setInterval(() => this.healthcheck(), this.healthcheckPeriod);
  }

  private async healthcheck(): Promise<void> {
    if (!this.webSocket && !this.reconnectTimer) {
      this.log.warn('WebSocket not connected');
      this.connectWebSocket();
      return;
    }

    if (this.webSocket && this.live) {
      await this.sendToWebSocket({ type: 'agent:heartbeat:request' });
    }
  }

  private connectWebSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const webSocketUrl = new URL(this.medplum.getBaseUrl());
    webSocketUrl.protocol = webSocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    webSocketUrl.pathname = '/ws/agent';
    this.log.info(`Connecting to WebSocket: ${webSocketUrl.href}`);

    this.webSocket = new WebSocket(webSocketUrl);
    this.webSocket.binaryType = 'nodebuffer';

    this.webSocket.addEventListener('error', (err) => {
      if (!this.shutdown) {
        this.log.error(normalizeErrorString(err.error));
      }
    });

    this.webSocket.addEventListener('open', async () => {
      await this.sendToWebSocket({
        type: 'agent:connect:request',
        accessToken: this.medplum.getAccessToken() as string,
        agentId: this.agentId,
      });
    });

    this.webSocket.addEventListener('close', () => {
      if (!this.shutdown) {
        this.webSocket = undefined;
        this.live = false;
        this.log.info('WebSocket closed');
        this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 1000);
      }
    });

    this.webSocket.addEventListener('message', async (e) => {
      try {
        const data = e.data as Buffer;
        const str = data.toString('utf8');
        this.log.debug(`Received from WebSocket: ${str.replaceAll('\r', '\n')}`);
        const command = JSON.parse(str) as AgentMessage;
        switch (command.type) {
          // @ts-expect-error - Deprecated message type
          case 'connected':
          case 'agent:connect:response':
            this.live = true;
            this.startWebSocketWorker();
            break;
          case 'agent:heartbeat:request':
            await this.sendToWebSocket({ type: 'agent:heartbeat:response' });
            break;
          case 'agent:heartbeat:response':
            // Do nothing
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
          case 'agent:error':
            this.log.error(command.body);
            break;
          default:
            this.log.error(`Unknown message type: ${command.type}`);
        }
      } catch (err) {
        this.log.error(`WebSocket error: ${normalizeErrorString(err)}`);
      }
    });
  }

  private async startListeners(): Promise<void> {
    const agent = await this.medplum.readResource('Agent', this.agentId);

    for (const definition of agent.channel ?? []) {
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
  }

  stop(): void {
    this.log.info('Medplum service stopping...');
    this.shutdown = true;

    if (this.healthcheckTimer) {
      clearInterval(this.healthcheckTimer);
      this.healthcheckTimer = undefined;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.channels.forEach((channel) => channel.stop());

    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = undefined;
    }

    this.log.info('Medplum service stopped successfully');
  }

  addToWebSocketQueue(message: AgentMessage): void {
    this.webSocketQueue.push(message);
    this.startWebSocketWorker();
  }

  addToHl7Queue(message: AgentMessage): void {
    this.hl7Queue.push(message);
    this.trySendToHl7Connection();
  }

  private startWebSocketWorker(): void {
    if (this.webSocketWorker) {
      // Websocket worker is already running
      return;
    }

    // Start the worker
    this.webSocketWorker = this.trySendToWebSocket()
      .then(() => {
        this.webSocketWorker = undefined;
      })
      .catch((err) => console.log('WebSocket worker error', err));
  }

  private async trySendToWebSocket(): Promise<void> {
    if (this.live) {
      while (this.webSocketQueue.length > 0) {
        const msg = this.webSocketQueue.shift();
        if (msg) {
          try {
            await this.sendToWebSocket(msg);
          } catch (err) {
            this.log.error(`WebSocket error: ${normalizeErrorString(err)}`);
            this.webSocketQueue.unshift(msg);
            throw err;
          }
        }
      }
    }
    this.webSocketWorker = undefined;
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

  private async sendToWebSocket(message: AgentMessage): Promise<void> {
    if (!this.webSocket) {
      throw new Error('WebSocket not connected');
    }
    if ('accessToken' in message) {
      // Use the latest access token
      // This can be necessary if the message was queued before the access token was refreshed
      await this.medplum.refreshIfExpired();
      message.accessToken = this.medplum.getAccessToken() as string;
    }
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
