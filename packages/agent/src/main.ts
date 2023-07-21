import { MedplumClient, normalizeErrorString } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { Hl7MessageEvent, Hl7Server } from '@medplum/hl7';
import { EventLogger } from 'node-windows';

const log = new EventLogger({
  source: 'MedplumService',
  eventLog: 'SYSTEM',
});

const HL7_CONTENT_TYPE = 'x-application/hl7-v2+er7';

export class App {
  readonly log: EventLogger;
  readonly server: Hl7Server;

  constructor(readonly medplum: MedplumClient, readonly bot: Bot) {
    this.log = new EventLogger({
      source: 'MedplumService',
      eventLog: 'SYSTEM',
    });

    this.server = new Hl7Server();
    this.server.addEventListener('message', (event) => this.handler(event));
  }

  start(): void {
    this.log.info('Medplum service starting...');
    this.server.start(56000);
    this.log.info('Medplum service started successfully');
  }

  stop(): void {
    this.log.info('Medplum service stopping...');
    this.server.stop();
    this.log.info('Medplum service stopped successfully');
  }

  private async handler(event: Hl7MessageEvent): Promise<void> {
    try {
      console.log('Received:');
      console.log(event.message.toString());

      await this.medplum.post(
        this.medplum.fhirUrl('Bot', this.bot.id as string, '$execute'),
        event.message.toString(),
        HL7_CONTENT_TYPE
      );

      const ack = event.message.buildAck();
      console.log('Response:');
      console.log(ack.toString());
      event.send(ack);
    } catch (err) {
      console.log('HL7 error', err);
      log.error(normalizeErrorString(err));
    }
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  new App(new MedplumClient(), { resourceType: 'Bot', id: '00000000-00000000-00000000-00000000' }).start();
}
