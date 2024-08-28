import { AgentTransmitResponse, ContentType, Logger, createReference, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Binary, Endpoint } from '@medplum/fhirtypes';
import * as dcmjs from 'dcmjs';
import * as dimse from 'dcmjs-dimse';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, unlinkSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from './app';
import { BaseChannel } from './channel';

export class AgentDicomChannel extends BaseChannel {
  private server: dimse.Server;
  private started = false;
  readonly tempDir: string;
  readonly log: Logger;

  constructor(
    readonly app: App,
    definition: AgentChannel,
    endpoint: Endpoint
  ) {
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
          let binary: Binary | undefined = undefined;
          let dicomJson: Record<string, unknown> | undefined = undefined;
          if (dataset) {
            // Save the DICOM file to a temp file
            const tempFileName = join(DcmjsDimseScp.channel.tempDir, randomUUID() + '.dcm');
            dataset.toFile(tempFileName);

            // Read the temp file into a buffer
            const buffer = readFileSync(tempFileName);

            // Upload the Medplum as a FHIR Binary
            const medplum = App.instance.medplum;
            binary = await medplum.createBinary(buffer, 'dicom.dcm', 'application/dicom');

            // Parse the DICOM file into DICOM JSON
            const dicomDict = dcmjs.data.DicomMessage.readFile(buffer.buffer);
            dicomJson = {
              ...dicomDict.meta,
              ...dicomDict.dict,
              '7FE00010': undefined, // Remove PixelData
            };

            // Delete the temp file
            unlinkSync(tempFileName);
          }

          const payload = {
            association: {
              callingAeTitle: this.association?.getCallingAeTitle(),
              calledAeTitle: this.association?.getCalledAeTitle(),
            },
            dataset: dicomJson,
            binary: binary ? createReference(binary) : undefined,
          };

          App.instance.addToWebSocketQueue({
            type: 'agent:transmit:request',
            accessToken: 'placeholder',
            channel: DcmjsDimseScp.channel.getDefinition().name as string,
            remote: this.association?.getCallingAeTitle() as string,
            contentType: ContentType.JSON,
            body: JSON.stringify(payload),
            callback: `Agent/${App.instance.agentId}-${randomUUID()}`,
          });
          response.setStatus(dimse.constants.Status.Success);
        } catch (err) {
          DcmjsDimseScp.channel.log.error(`DICOM error: ${normalizeErrorString(err)}`);
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
    this.log = app.log.clone({ options: { prefix: `[DICOM:${definition.name}] ` } });
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const address = new URL(this.getEndpoint().address as string);
    this.log.info(`Channel starting on ${address}`);
    this.server.on('networkError', (e) => console.log('Network error: ', e));
    this.server.listen(Number.parseInt(address.port, 10));
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
