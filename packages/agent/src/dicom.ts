import { AgentTransmitResponse, ContentType, createReference, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Binary, Endpoint } from '@medplum/fhirtypes';
import * as dcmjs from 'dcmjs';
import * as dimse from 'dcmjs-dimse';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from './app';
import { Channel } from './channel';

export class AgentDicomChannel implements Channel {
  static instance: AgentDicomChannel;
  readonly server: dimse.Server;
  readonly tempDir: string;

  constructor(
    readonly app: App,
    readonly definition: AgentChannel,
    readonly endpoint: Endpoint
  ) {
    AgentDicomChannel.instance = this;
    this.server = new dimse.Server(DcmjsDimseScp);
    this.tempDir = mkdtempSync(join(tmpdir(), 'dicom-'));
  }

  start(): void {
    const address = new URL(this.endpoint.address as string);
    this.app.log.info(`Channel starting on ${address}`);
    this.server.on('networkError', (e) => console.log('Network error: ', e));
    this.server.listen(parseInt(address.port, 10));
    this.app.log.info('Channel started successfully');
  }

  stop(): void {
    this.app.log.info('Channel stopping...');
    this.server.close();
    this.app.log.info('Channel stopped successfully');
  }

  sendToRemote(msg: AgentTransmitResponse): void {
    throw new Error(`sendToRemote not implemented (${JSON.stringify(msg)})`);
  }
}

class DcmjsDimseScp extends dimse.Scp {
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
        const tempFileName = join(AgentDicomChannel.instance.tempDir, randomUUID() + '.dcm');
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
        channel: AgentDicomChannel.instance.definition.name as string,
        remote: this.association?.getCallingAeTitle() as string,
        contentType: ContentType.JSON,
        body: JSON.stringify(payload),
      });
      response.setStatus(dimse.constants.Status.Success);
    } catch (err) {
      App.instance.log.error(`DICOM error: ${normalizeErrorString(err)}`);
      response.setStatus(dimse.constants.Status.ProcessingFailure);
    }

    return response;
  }
}
