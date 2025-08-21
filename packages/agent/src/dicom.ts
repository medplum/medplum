// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, normalizeErrorString, sleep } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import * as dcmjs from 'dcmjs';
import * as dimse from 'dcmjs-dimse';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import type net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { App } from './app';
import { BaseChannel } from './channel';

const { data } = dcmjs;
const { DicomMetaDictionary, DicomDict } = data;

const { constants, Dataset, Implementation } = dimse;
const { StorageClass } = constants;

export class AgentDicomChannel extends BaseChannel {
  private server: dimse.Server;
  private started = false;
  readonly tempDir: string;
  readonly log: ILogger;
  readonly channelLog: ILogger;
  private prefix: string;

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    super(app, definition, endpoint);

    class DcmjsDimseScp extends dimse.Scp {
      static channel: AgentDicomChannel;
      association?: dimse.association.Association;

      /**
       * Handle incoming association requests.
       * @param association - The incoming association.
       */
      associationRequested(association: dimse.association.Association): void {
        this.association = association;

        // Set the preferred max PDU length
        association.setMaxPduLength(65536);

        // Accept all presentation contexts, as needed
        association.getPresentationContexts().forEach(({ context }) => {
          context.getTransferSyntaxUids().forEach((ts) => {
            context.setResult(dimse.constants.PresentationContextResult.Accept, ts);
          });
        });

        this.sendAssociationAccept();
      }

      /**
       * Handle incoming association release requests.
       */
      associationReleaseRequested(): void {
        this.sendAssociationReleaseResponse();
      }

      /**
       * Handle incoming C-ECHO requests.
       * @param request - The incoming C-ECHO request.
       * @param callback - The callback function to invoke with the C-ECHO response.
       */
      cEchoRequest(
        request: dimse.requests.CEchoRequest,
        callback: (response: dimse.responses.CEchoResponse) => void
      ): void {
        const response = dimse.responses.CEchoResponse.fromRequest(request);
        response.setStatus(dimse.constants.Status.Success);
        callback(response);
      }

      /**
       * Handle incoming C-STORE requests.
       * @param request - The incoming C-STORE request.
       * @param callback - The callback function to invoke with the C-STORE response.
       */
      cStoreRequest(
        request: dimse.requests.CStoreRequest,
        callback: (response: dimse.responses.CStoreResponse) => void
      ): void {
        this.cStoreImpl(request).then(callback).catch(console.error);
      }

      private async cStoreImpl(request: dimse.requests.CStoreRequest): Promise<dimse.responses.CStoreResponse> {
        const response = dimse.responses.CStoreResponse.fromRequest(request);
        try {
          const dataset = request.getDataset();
          let dicomJson: Record<string, unknown> | undefined = undefined;
          if (dataset) {
            const buffer = datasetToBuffer(dataset);
            const medplum = App.instance.medplum;
            const boundary = `medplum-${Date.now()}`;
            const contentType = `multipart/related; type=application/dicom; boundary=${boundary}`;
            const stream = new PassThrough();
            const writePromise = writeMultipartRelatedBody(stream, [buffer], boundary);
            const requestPromise = medplum.post('/dicomweb/studies', stream, contentType);
            await writePromise;
            const text = await requestPromise;
            DcmjsDimseScp.channel.log.info(`DICOM instance stored successfully via DICOMweb STOW-RS: ${text}`);
            dicomJson = {
              ...dataset.getElements(),
              '7FE00010': undefined, // Remove PixelData
            };
          }

          const payload = {
            association: {
              callingAeTitle: this.association?.getCallingAeTitle(),
              calledAeTitle: this.association?.getCalledAeTitle(),
            },
            dataset: dicomJson,
          };

          App.instance.addToWebSocketQueue({
            type: 'agent:transmit:request',
            accessToken: 'placeholder',
            channel: DcmjsDimseScp.channel.getDefinition().name,
            remote: this.association?.getCallingAeTitle() as string,
            contentType: ContentType.JSON,
            body: JSON.stringify(payload),
            callback: `Agent/${App.instance.agentId}-${randomUUID()}`,
          });
          response.setStatus(dimse.constants.Status.Success);
        } catch (err) {
          DcmjsDimseScp.channel.log.error(`DICOM error - check channel logs`);
          DcmjsDimseScp.channel.channelLog.error(`DICOM error: ${normalizeErrorString(err)}`);
          response.setStatus(dimse.constants.Status.ProcessingFailure);
        }

        return response;
      }
    }
    DcmjsDimseScp.channel = this;

    this.server = new dimse.Server(DcmjsDimseScp);
    this.tempDir = mkdtempSync(join(tmpdir(), 'dicom-'));

    // We can set the log prefix statically because we know this channel is keyed off of the name of the channel in the AgentChannel
    // So this channel's name will remain the same for the duration of its lifetime
    this.prefix = `[DICOM:${definition.name}] `;
    this.log = app.log.clone({ options: { prefix: this.prefix } });
    this.channelLog = app.channelLog.clone({ options: { prefix: this.prefix } });
  }

  async reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void> {
    const previousEndpoint = this.endpoint;
    this.definition = definition;
    this.endpoint = endpoint;
    this.prefix = `[DICOM:${definition.name}] `;

    this.log.info('Reloading config... Evaluating if channel needs to change address...');

    if (this.needToRebindToPort(previousEndpoint, endpoint)) {
      await this.stop();
      await this.start();
      this.log.info(`Address changed: ${previousEndpoint.address} => ${endpoint.address}`);
    } else {
      this.log.info(`No address change needed. Listening at ${endpoint.address}`);
    }
  }

  private needToRebindToPort(firstEndpoint: Endpoint, secondEndpoint: Endpoint): boolean {
    if (
      firstEndpoint.address === secondEndpoint.address ||
      new URL(firstEndpoint.address).port === new URL(secondEndpoint.address).port
    ) {
      return false;
    }
    return true;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    const address = new URL(this.getEndpoint().address);
    this.log.info(`Channel starting on ${address}`);
    const port = Number.parseInt(address.port, 10);

    await new Promise((resolve) => {
      this.server.on('networkError', async (err) => {
        this.log.error('Network error: ', { err });
        if ((err as Error & { code?: string })?.code === 'EADDRINUSE') {
          await sleep(50);
          this.server.close();
          this.server.listen(port);
        }
      });

      this.server.once('listening', resolve);

      this.server.listen(port);
    });

    this.log.info('Channel started successfully');
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.log.info('Channel stopping...');

    // Wait for server to close
    await new Promise<void>((resolve) => {
      // @ts-expect-error Types don't list this internal member
      (this.server.server as net.Server).on('close', () => {
        resolve();
      });
      this.server.close();
    });

    this.started = false;
    this.log.info('Channel stopped successfully');
  }

  sendToRemote(msg: AgentTransmitResponse): void {
    throw new Error(`sendToRemote not implemented (${JSON.stringify(msg)})`);
  }
}

/**
 * Serializes a dataset to DICOM P10 buffer.
 *
 * Based on: https://github.com/PantelisGeorgiadis/dcmjs-dimse/blob/master/src/Dataset.js#L178
 *
 * See method `toFile()`, which only writes to a file, but we want to write to a buffer so we can send via DICOMweb STOW-RS without needing to write to disk first.
 *
 * @param dataset - The DICOM dataset to save.
 * @param writeOptions - The write options to pass through to `DicomDict.write()`.
 * @returns A buffer containing the DICOM P10 file data.
 */
function datasetToBuffer(dataset: dimse.Dataset, writeOptions?: object): Buffer {
  const elements = {
    _meta: {
      FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
      MediaStorageSOPClassUID: dataset.getElement('SOPClassUID') || StorageClass.SecondaryCaptureImageStorage,
      MediaStorageSOPInstanceUID: dataset.getElement('SOPInstanceUID') || Dataset.generateDerivedUid(),
      TransferSyntaxUID: dataset.getTransferSyntaxUid(),
      ImplementationClassUID: Implementation.getImplementationClassUid(),
      ImplementationVersionName: Implementation.getImplementationVersion(),
    },
    ...dataset.getElements(),
  };
  const denaturalizedMetaHeader = DicomMetaDictionary.denaturalizeDataset(elements._meta);
  const dicomDict = new DicomDict(denaturalizedMetaHeader);
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(elements);
  return Buffer.from(dicomDict.write(writeOptions));
}

async function writeMultipartRelatedBody(out: PassThrough, fileBuffers: Buffer[], boundary: string): Promise<void> {
  try {
    for (const fileBuffer of fileBuffers) {
      await writeBuffer(out, Buffer.from(`--${boundary}\r\n`));
      await writeBuffer(out, Buffer.from('Content-Type: application/dicom\r\n'));
      await writeBuffer(out, Buffer.from('\r\n'));
      await writeBuffer(out, fileBuffer);
      await writeBuffer(out, Buffer.from('\r\n'));
    }
    await writeBuffer(out, Buffer.from(`--${boundary}--\r\n`));
    out.end();
  } catch (err) {
    out.destroy(err as Error);
    throw err;
  }
}

async function writeBuffer(stream: PassThrough, buffer: Buffer): Promise<void> {
  if (!stream.write(buffer)) {
    await once(stream, 'drain');
  }
}
