import { AgentTransmitResponse, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import * as dimse from 'dcmjs-dimse';
import { App } from './app';
import { Channel } from './channel';

export class AgentDicomChannel implements Channel {
  static instance: AgentDicomChannel;
  readonly server: dimse.Server;

  constructor(
    readonly app: App,
    readonly definition: AgentChannel,
    readonly endpoint: Endpoint
  ) {
    AgentDicomChannel.instance = this;
    this.server = new dimse.Server(DcmjsDimseScp);
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
  /**
   * Handle incoming association requests.
   * @param association - The incoming association.
   */
  associationRequested(association: dimse.association.Association): void {
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
    try {
      App.instance.addToWebSocketQueue({
        type: 'agent:transmit:request',
        accessToken: App.instance.medplum.getAccessToken() as string,
        channel: AgentDicomChannel.instance.definition.name as string,
        remote: 'foo',
        body: JSON.stringify(request.getDataset()),
      });
    } catch (err) {
      App.instance.log.error(`DICOM error: ${normalizeErrorString(err)}`);
    }

    const response = dimse.responses.CStoreResponse.fromRequest(request);
    response.setStatus(dimse.constants.Status.Success);
    callback(response);
  }
}
