import { formatHl7DateTime, Hl7Message } from '@medplum/core';
import { Hl7Client, Hl7Server } from '@medplum/hl7';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createMedplumCommand } from './util/command';

const HL7_NOW = formatHl7DateTime(new Date());
const HL7_CONTROL_ID = Date.now().toString();
const SAMPLE_HL7_MESSAGE = `MSH|^~\\&|ADTSYS|HOSPITAL|RECEIVER|DEST|${HL7_NOW}||ADT^A01|${HL7_CONTROL_ID}|P|2.5|
EVN|A01|${HL7_NOW}||
PID|1|12345|12345^^^HOSP^MR|123456|DOE^JOHN^MIDDLE^SUFFIX|19800101|M|||123 STREET^APT 4B^CITY^ST^12345-6789||555-555-5555||S|
PV1|1|I|2000^2012^01||||12345^DOCTOR^DOC||||||||||1234567^DOCTOR^DOC||AMB|||||||||||||||||||||||||202309280900|`;

const send = createMedplumCommand('send')
  .description('Send an HL7 v2 message via MLLP')
  .argument('<host>', 'The destination host name or IP address')
  .argument('<port>', 'The destination port number')
  .argument('[body]', 'Optional HL7 message body')
  .option('--generate', 'Generate a sample HL7 message')
  .option('--file', 'Read the HL7 message from a file')
  .action(async (host, port, body, options) => {
    if (options.generate) {
      body = SAMPLE_HL7_MESSAGE;
    } else if (options.file) {
      body = readFileSync(resolve(process.cwd(), body), 'utf8');
    }

    if (!body) {
      throw new Error('Missing HL7 message body');
    }

    const client = new Hl7Client({
      host,
      port: parseInt(port, 10),
    });

    const response = await client.sendAndWait(Hl7Message.parse(body));
    console.log(response.toString().replaceAll('\r', '\n'));
    client.close();
  });

const listen = createMedplumCommand('listen')
  .description('Starts an HL7 v2 MLLP server')
  .argument('<port>')
  .action(async (port) => {
    const server = new Hl7Server((connection) => {
      connection.addEventListener('message', ({ message }) => {
        console.log(message.toString().replaceAll('\r', '\n'));
        connection.send(message.buildAck());
      });
    });

    server.start(parseInt(port, 10));
    console.log('Listening on port ' + port);
  });

export const hl7 = new Command('hl7').addCommand(send).addCommand(listen);
