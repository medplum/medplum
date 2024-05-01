import { AgentTransmitResponse, ContentType, Hl7Message, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import { Hl7Connection, Hl7MessageEvent, Hl7Server } from '@medplum/hl7';
import { App } from './app';
import { Channel, needToRebindToPort } from './channel';

export class AgentHl7Channel implements Channel {
  readonly server: Hl7Server;
  protected definition: AgentChannel;
  private endpoint: Endpoint;
  private started = false;
  readonly connections = new Map<string, AgentHl7ChannelConnection>();

  constructor(
    readonly app: App,
    definition: AgentChannel,
    endpoint: Endpoint
  ) {
    this.server = new Hl7Server((connection) => this.handleNewConnection(connection));
    this.definition = definition;
    this.endpoint = endpoint;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const address = new URL(this.endpoint.address as string);
    this.app.log.info(`Channel starting on ${address}`);
    this.server.start(Number.parseInt(address.port, 10));
    this.app.log.info('Channel started successfully');
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.app.log.info('Channel stopping...');
    this.connections.forEach((connection) => connection.close());
    await this.server.stop();
    this.started = false;
    this.app.log.info('Channel stopped successfully');
  }

  sendToRemote(msg: AgentTransmitResponse): void {
    const connection = this.connections.get(msg.remote as string);
    if (connection) {
      connection.hl7Connection.send(Hl7Message.parse(msg.body));
    }
  }

  async reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void> {
    const previousEndpoint = this.endpoint;
    this.definition = definition;
    this.endpoint = endpoint;

    this.app.log.info(`[HL7:${definition.name}] Reloading config... Evaluating if channel needs to change address...`);

    if (needToRebindToPort(previousEndpoint, endpoint)) {
      await this.stop();
      this.start();
      this.app.log.info(`[HL7:${definition.name}] Address changed: ${previousEndpoint.address} => ${endpoint.address}`);
    } else {
      this.app.log.info(`[HL7:${definition.name}] No address change needed. Listening at ${endpoint.address}`);
    }
  }

  getDefinition(): AgentChannel {
    return this.definition;
  }

  getEndpoint(): Endpoint {
    return this.endpoint;
  }

  private handleNewConnection(connection: Hl7Connection): void {
    const c = new AgentHl7ChannelConnection(this, connection);
    this.app.log.info(`HL7 connection established: ${c.remote}`);
    this.connections.set(c.remote, c);
  }
}

export class AgentHl7ChannelConnection {
  readonly remote: string;

  constructor(
    readonly channel: AgentHl7Channel,
    readonly hl7Connection: Hl7Connection
  ) {
    this.remote = `${hl7Connection.socket.remoteAddress}:${hl7Connection.socket.remotePort}`;

    // Add listener immediately to handle incoming messages
    this.hl7Connection.addEventListener('message', (event) => this.handler(event));
  }

  private async handler(event: Hl7MessageEvent): Promise<void> {
    try {
      this.channel.app.log.info('Received:');
      this.channel.app.log.info(event.message.toString().replaceAll('\r', '\n'));
      this.channel.app.addToWebSocketQueue({
        type: 'agent:transmit:request',
        accessToken: 'placeholder',
        channel: this.channel.getDefinition().name as string,
        remote: this.remote,
        contentType: ContentType.HL7_V2,
        body: event.message.toString(),
      });
    } catch (err) {
      this.channel.app.log.error(`HL7 error: ${normalizeErrorString(err)}`);
    }
  }

  close(): void {
    this.hl7Connection.close();
  }
}
