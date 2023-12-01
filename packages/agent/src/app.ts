import { Hl7Message, MedplumClient, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Endpoint, Reference } from '@medplum/fhirtypes';
import { Hl7Client } from '@medplum/hl7';
import { EventLogger } from 'node-windows';
import WebSocket from 'ws';
import { Channel, QueueItem } from './channel';
import { AgentDicomChannel } from './dicom';
import { AgentHl7Channel } from './hl7';

export class App {
  readonly log: EventLogger;
  readonly webSocket: WebSocket;
  readonly webSocketQueue: QueueItem[] = [];
  readonly channels = new Map<string, Channel>();
  readonly hl7Queue: QueueItem[] = [];
  live = false;

  constructor(
    readonly medplum: MedplumClient,
    readonly agentId: string
  ) {
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
      this.webSocket.send(
        JSON.stringify({
          type: 'connect',
          accessToken: medplum.getAccessToken(),
          agentId,
        })
      );
    });

    this.webSocket.addEventListener('message', (e) => {
      try {
        const data = e.data as Buffer;
        const str = data.toString('utf8');
        this.log.info(`Received from WebSocket: ${str.replaceAll('\r', '\n')}`);
        const command = JSON.parse(str);
        switch (command.type) {
          case 'connected':
            this.live = true;
            this.trySendToWebSocket();
            break;
          case 'transmit':
            this.addToHl7Queue(command);
            break;
          case 'push':
            this.pushMessage(command);
            break;
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

  addToWebSocketQueue(message: QueueItem): void {
    this.webSocketQueue.push(message);
    this.trySendToWebSocket();
  }

  addToHl7Queue(message: QueueItem): void {
    this.hl7Queue.push(message);
    this.trySendToHl7Connection();
  }

  private trySendToWebSocket(): void {
    if (this.live) {
      while (this.webSocketQueue.length > 0) {
        const msg = this.webSocketQueue.shift();
        if (msg) {
          this.webSocket.send(
            JSON.stringify({
              type: 'transmit',
              accessToken: this.medplum.getAccessToken(),
              ...msg,
            })
          );
        }
      }
    }
  }

  private trySendToHl7Connection(): void {
    while (this.hl7Queue.length > 0) {
      const msg = this.hl7Queue.shift();
      if (msg) {
        const channel = this.channels.get(msg.channel);
        if (channel) {
          channel.sendToRemote(msg);
        }
      }
    }
  }

  private pushMessage(message: QueueItem): void {
    const address = new URL(message.remote);
    const client = new Hl7Client({
      host: address.hostname,
      port: parseInt(address.port, 10),
    });

    client
      .sendAndWait(Hl7Message.parse(message.body))
      .then((response) => {
        this.log.info(`Response: ${response.toString().replaceAll('\r', '\n')}`);
      })
      .catch((err) => {
        this.log.error(`HL7 error: ${normalizeErrorString(err)}`);
      })
      .finally(() => {
        client.close();
      });
  }
}
