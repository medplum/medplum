import { formatHl7DateTime, Hl7Message } from '@medplum/core';
import { Hl7Client, Hl7Server } from '@medplum/hl7';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { createMedplumCommand } from './util/command';

const send = createMedplumCommand('send')
  .description('Send an HL7 v2 message via MLLP')
  .argument('<host>', 'The destination host name or IP address')
  .argument('<port>', 'The destination port number')
  .argument('[body]', 'Optional HL7 message body')
  .option('--generate-example', 'Generate a sample HL7 message')
  .option('--file <file>', 'Read the HL7 message from a file')
  .option('--encoding <encoding>', 'The encoding to use')
  .action(async (host, port, body, options) => {
    if (options.generateExample) {
      body = generateSampleHl7Message();
    } else if (options.file) {
      body = readFileSync(options.file, 'utf8');
    }

    if (!body) {
      throw new Error('Missing HL7 message body');
    }

    const client = new Hl7Client({
      host,
      port: Number.parseInt(port, 10),
      encoding: options.encoding,
    });

    try {
      const response = await client.sendAndWait(Hl7Message.parse(body));
      console.log(response.toString().replaceAll('\r', '\n'));
    } finally {
      client.close();
    }
  });

const listen = createMedplumCommand('listen')
  .description('Starts an HL7 v2 MLLP server')
  .argument('<port>')
  .option('--encoding <encoding>', 'The encoding to use')
  .action(async (port, options) => {
    const server = new Hl7Server((connection) => {
      connection.addEventListener('message', ({ message }) => {
        console.log(message.toString().replaceAll('\r', '\n'));
        connection.send(message.buildAck());
      });
    });

    server.start(Number.parseInt(port, 10), options.encoding);
    console.log('Listening on port ' + port);
  });

export const hl7 = new Command('hl7').addCommand(send).addCommand(listen);

export function generateSampleHl7Message(): string {
  const now = formatHl7DateTime(new Date());
  const controlId = Date.now().toString();
  return `MSH|^~\\&|ADTSYS|HOSPITAL|RECEIVER|DEST|${now}||ADT^A01|${controlId}|P|2.5|
EVN|A01|${now}||
PID|1|12345|12345^^^HOSP^MR|123456|DOE^JOHN^MIDDLE^SUFFIX|19800101|M|||123 STREET^APT 4B^CITY^ST^12345-6789||555-555-5555||S|
PV1|1|I|2000^2012^01||||12345^DOCTOR^DOC||||||||||1234567^DOCTOR^DOC||AMB|||||||||||||||||||||||||202309280900|`;
}
