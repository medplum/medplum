import { Hl7Message, MedplumClient, resolveId } from '@medplum/core';
import { Agent, AgentChannel, Bot, Reference } from '@medplum/fhirtypes';
import { Hl7Connection, Hl7MessageEvent, Hl7Server } from '@medplum/hl7';
import { readFileSync } from 'fs';
import { EventLogger } from 'node-windows';
import WebSocket from 'ws';

export class App {
  readonly log: EventLogger;
  readonly channels: AgentHl7Channel[];

  constructor(readonly medplum: MedplumClient, readonly agent: Agent) {
    if (agent.setting?.find((s) => s.name === 'useSystemEventLog' && s.valueBoolean === true)) {
      this.log = new EventLogger({
        source: 'MedplumService',
        eventLog: 'SYSTEM',
      });
    } else {
      this.log = {
        info: console.log,
        warn: console.warn,
        error: console.error,
      } as EventLogger;
    }

    this.channels = (agent.channel as AgentChannel[]).map((channel) => new AgentHl7Channel(this, channel));
  }

  start(): void {
    this.log.info('Medplum service starting...');
    this.channels.forEach((channel) => channel.start());
    this.log.info('Medplum service started successfully');
  }

  stop(): void {
    this.log.info('Medplum service stopping...');
    this.channels.forEach((channel) => channel.stop());
    this.log.info('Medplum service stopped successfully');
  }
}

export class AgentHl7Channel {
  readonly server: Hl7Server;
  readonly connections: AgentHl7ChannelConnection[] = [];

  constructor(readonly app: App, readonly definition: AgentChannel) {
    this.server = new Hl7Server((connection) => {
      this.app.log.info('HL7 connection established');
      this.connections.push(new AgentHl7ChannelConnection(this, connection));
    });
  }

  start(): void {
    this.app.log.info('Channel starting on port ' + this.definition.port + '...');
    this.server.start(this.definition.port as number);
    this.app.log.info('Channel started successfully');
  }

  stop(): void {
    this.app.log.info('Channel stopping...');
    for (const connection of this.connections) {
      connection.close();
    }
    this.server.stop();
    this.app.log.info('Channel stopped successfully');
  }
}

export class AgentHl7ChannelConnection {
  readonly webSocket: WebSocket;
  readonly webSocketQueue: Hl7Message[] = [];
  readonly hl7ConnectionQueue: Hl7Message[] = [];
  live = false;

  constructor(readonly channel: AgentHl7Channel, readonly hl7Connection: Hl7Connection) {
    const app = channel.app;
    const medplum = app.medplum;

    // Add listener immediately to handle incoming messages
    this.hl7Connection.addEventListener('message', (event) => this.handler(event));

    const webSocketUrl = new URL(medplum.getBaseUrl());
    webSocketUrl.protocol = webSocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    webSocketUrl.pathname = '/ws/agent';
    console.log('Connecting to WebSocket:', webSocketUrl.href);

    this.webSocket = new WebSocket(webSocketUrl);
    this.webSocket.binaryType = 'nodebuffer';
    this.webSocket.addEventListener('error', console.error);
    this.webSocket.addEventListener('open', () => {
      this.webSocket.send(
        JSON.stringify({
          type: 'connect',
          accessToken: medplum.getAccessToken(),
          botId: resolveId(channel.definition.target as Reference<Bot>),
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
  const config = JSON.parse(readFileSync('medplum.config.json', 'utf8'));
  const medplum = new MedplumClient(config);
  medplum
    .startClientLogin(config.clientId, config.clientSecret)
    .then(() => medplum.readResource('Agent', config.agentId))
    .then((agent) => new App(medplum, agent).start())
    .catch(console.error);
}
