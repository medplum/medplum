import { AgentTransmitResponse, ContentType, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import { SerialPort } from 'serialport';
import { App } from './app';
import { Channel } from './channel';

export const ASCII_START_OF_HEADING = 0x01;
export const ASCII_START_OF_TEXT = 0x02;
export const ASCII_END_OF_TEXT = 0x03;
export const ASCII_END_OF_TRANSMISSION = 0x04;
export const ASCII_ENQUIRY = 0x05;
export const ASCII_ACKNOWLEDGE = 0x06;
export const ASCII_NEW_LINE = 0x0a;

export class AgentSerialPortChannel implements Channel {
  readonly port: SerialPort;
  readonly url: URL;
  readonly path: string;
  private buffer = '';

  constructor(
    readonly app: App,
    readonly definition: AgentChannel,
    readonly endpoint: Endpoint
  ) {
    this.url = new URL(this.endpoint.address as string);
    this.path = this.url.hostname + this.url.pathname;

    // Create a new port connection
    this.port = new SerialPort({
      path: this.path,
      baudRate: parseInt(this.url.searchParams.get('baudRate') || '9600', 10),
      dataBits: parseInt(this.url.searchParams.get('dataBits') || '8', 10) as 5 | 6 | 7 | 8,
      stopBits: parseFloat(this.url.searchParams.get('stopBits') || '1') as 1 | 1.5 | 2,
      autoOpen: false,
    });
  }

  start(): void {
    this.app.log.info(`Channel starting on ${this.url}`);

    // Parse options
    const clearOnStartOfHeading = this.url.searchParams.get('clearOnStartOfHeading') === 'true';
    const clearOnStartOfText = this.url.searchParams.get('clearOnStartOfText') === 'true';
    const ackOnEndOfText = this.url.searchParams.get('ackOnEndOfText') === 'true';
    const ackOnEndOfTransmission = this.url.searchParams.get('ackOnEndOfTransmission') === 'true';
    const transmitOnEndOfText = this.url.searchParams.get('transmitOnEndOfText') === 'true';
    const transmitOnEndOfTransmission = this.url.searchParams.get('transmitOnEndOfTransmission') === 'true';
    const ackOnEnquiry = this.url.searchParams.get('ackOnEnquiry') === 'true';
    const ackOnNewLine = this.url.searchParams.get('ackOnNewLine') === 'true';
    const transmitOnNewLine = this.url.searchParams.get('transmitOnNewLine') === 'true';

    // Add event handler for the "open" event
    // Just log a message
    this.port.on('open', () => {
      this.logInfo(`[${this.path}] Serial port open`);
      this.sendToServer(`[${this.path}] Serial port open`);
    });

    // Add event handler for the "error" event
    // Just log a message
    this.port.on('error', (err) => {
      this.logError(`[${this.path}] Serial port error: ` + err);
      this.sendToServer(`[${this.path}] Serial port error: ` + err);
    });

    // Add event handler for the "data" event
    // Convert the contents to ASCII
    // Build up the data buffer
    // When we receive the "end" code (0x03), then send to the cloud
    this.port.on('data', (data) => {
      const str = data.toString('ascii');
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        switch (code) {
          case ASCII_START_OF_HEADING:
            if (clearOnStartOfHeading) {
              this.buffer = '';
            }
            break;

          case ASCII_START_OF_TEXT:
            if (clearOnStartOfText) {
              this.buffer = '';
            }
            break;

          case ASCII_END_OF_TEXT:
            if (transmitOnEndOfText) {
              this.sendToServer(this.buffer);
              this.buffer = '';
            }
            if (ackOnEndOfText) {
              this.port.write(String.fromCharCode(ASCII_ACKNOWLEDGE));
            }
            break;

          case ASCII_END_OF_TRANSMISSION:
            if (transmitOnEndOfTransmission) {
              this.sendToServer(this.buffer);
              this.buffer = '';
            }
            if (ackOnEndOfTransmission) {
              this.port.write(String.fromCharCode(ASCII_ACKNOWLEDGE));
            }
            break;

          case ASCII_ENQUIRY:
            if (ackOnEnquiry) {
              this.port.write(String.fromCharCode(ASCII_ACKNOWLEDGE));
            }
            break;

          case ASCII_NEW_LINE:
            if (transmitOnNewLine) {
              this.sendToServer(this.buffer);
              this.buffer = '';
            } else {
              this.buffer += '\n';
            }
            if (ackOnNewLine) {
              this.port.write(String.fromCharCode(ASCII_ACKNOWLEDGE));
            }
            break;

          default:
            // Otherwise add to the buffer
            this.buffer += str.charAt(i);
            break;
        }
      }
    });

    // Open the connection
    this.port.open((err) => {
      if (err) {
        this.logError(`[${this.path}] Error opening serial port: ` + err);
      }
    });

    this.sendToServer(`[${this.path}] Running`);

    this.app.log.info('Channel started successfully');
  }

  stop(): void {
    this.app.log.info('Channel stopping...');
    this.port.close((err) => {
      if (err) {
        this.logError(`[${this.path}] Error closing serial port: ` + err);
      }
    });
    this.app.log.info('Channel stopped successfully');
  }

  sendToRemote(msg: AgentTransmitResponse): void {
    console.warn(`SerialPort sendToRemote not implemented (${msg.body})`);
  }

  private sendToServer(body: string): void {
    try {
      this.app.log.info('Received:');
      this.app.log.info(body);
      this.app.addToWebSocketQueue({
        type: 'agent:transmit:request',
        accessToken: 'placeholder',
        channel: this.definition.name as string,
        remote: this.path,
        contentType: ContentType.TEXT,
        body,
      });
    } catch (err) {
      this.app.log.error(`HL7 error: ${normalizeErrorString(err)}`);
    }
  }

  private logInfo(message: string): void {
    this.app.log.info(message);
  }

  private logError(message: string): void {
    this.app.log.error(message);
  }
}
