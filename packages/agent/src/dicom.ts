import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import { Dataset, Scp, Server, association, constants, requests, responses } from 'dcmjs-dimse';
import { Socket } from 'net';
import { TLSSocket } from 'tls';
import { App } from './app';
import { Channel, QueueItem } from './channel';

const {
  Status,
  PresentationContextResult,
  UserIdentityType,
  RejectResult,
  RejectSource,
  RejectReason,
  TransferSyntax,
  SopClass,
  StorageClass,
} = constants;

const { CEchoResponse, CFindResponse, CStoreResponse } = responses;

export class AgentDicomChannel implements Channel {
  readonly server: Server;

  constructor(
    readonly app: App,
    readonly definition: AgentChannel,
    readonly endpoint: Endpoint
  ) {
    this.server = new Server(DcmjsDimseScp);
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

  sendToRemote(msg: QueueItem): void {
    throw new Error(`sendToRemote not implemented (${JSON.stringify(msg)})`);
  }
}

class DcmjsDimseScp extends Scp {
  association?: association.Association;

  constructor(socket: Socket | TLSSocket, opts?: any) {
    super(socket, opts);
    this.association = undefined;
  }

  /**
   * Handle incoming association requests.
   * @param association - The incoming association.
   */
  associationRequested(association: association.Association): void {
    this.association = association;

    // Evaluate calling/called AET and reject association, if needed
    if (this.association.getCallingAeTitle() !== 'SCU') {
      this.sendAssociationReject(RejectResult.Permanent, RejectSource.ServiceUser, RejectReason.CallingAeNotRecognized);
      return;
    }

    // Evaluate user identity and reject association, if needed
    if (this.association.getNegotiateUserIdentity() && this.association.getUserIdentityPositiveResponseRequested()) {
      if (
        this.association.getUserIdentityType() === UserIdentityType.UsernameAndPasscode &&
        this.association.getUserIdentityPrimaryField() === 'USERNAME' &&
        this.association.getUserIdentitySecondaryField() === 'PASSWORD'
      ) {
        this.association.setUserIdentityServerResponse('');
        this.association.setNegotiateUserIdentityServerResponse(true);
      } else {
        this.sendAssociationReject(RejectResult.Permanent, RejectSource.ServiceUser, RejectReason.NoReasonGiven);
        return;
      }
    }

    // Optionally set the preferred max PDU length
    this.association.setMaxPduLength(65536);

    const contexts = association.getPresentationContexts();
    contexts.forEach((c) => {
      const context = association.getPresentationContext(c.id);
      if (
        context.getAbstractSyntaxUid() === SopClass.Verification ||
        context.getAbstractSyntaxUid() === SopClass.StudyRootQueryRetrieveInformationModelFind ||
        context.getAbstractSyntaxUid() === StorageClass.MrImageStorage
        // Accept other presentation contexts, as needed
      ) {
        const transferSyntaxes = context.getTransferSyntaxUids();
        transferSyntaxes.forEach((transferSyntax) => {
          if (
            transferSyntax === TransferSyntax.ImplicitVRLittleEndian ||
            transferSyntax === TransferSyntax.ExplicitVRLittleEndian
          ) {
            context.setResult(PresentationContextResult.Accept, transferSyntax);
          } else {
            context.setResult(PresentationContextResult.RejectTransferSyntaxesNotSupported);
          }
        });
      } else {
        context.setResult(PresentationContextResult.RejectAbstractSyntaxNotSupported);
      }
    });
    this.sendAssociationAccept();
  }

  /**
   * Handle incoming C-ECHO requests.
   * @param request - The incoming C-ECHO request.
   * @param callback - The callback function to invoke with the C-ECHO response.
   */
  cEchoRequest(request: requests.CEchoRequest, callback: (response: responses.CEchoResponse) => void): void {
    const response = CEchoResponse.fromRequest(request);
    response.setStatus(Status.Success);

    callback(response);
  }

  /**
   * Handle incoming C-FIND requests.
   * @param request - The incoming C-FIND request.
   * @param callback - The callback function to invoke with the C-FIND responses.
   */
  cFindRequest(request: requests.CFindRequest, callback: (responses: responses.CFindResponse[]) => void): void {
    console.log(request.getDataset());

    const pendingResponse = CFindResponse.fromRequest(request);
    pendingResponse.setDataset(new Dataset({ PatientID: '12345', PatientName: 'JOHN^DOE' }));
    pendingResponse.setStatus(Status.Pending);

    const finalResponse = CFindResponse.fromRequest(request);
    finalResponse.setStatus(Status.Success);

    callback([pendingResponse, finalResponse]);
  }

  /**
   * Handle incoming C-STORE requests.
   * @param request - The incoming C-STORE request.
   * @param callback - The callback function to invoke with the C-STORE response.
   */
  cStoreRequest(request: requests.CStoreRequest, callback: (response: responses.CStoreResponse) => void): void {
    console.log(request.getDataset());

    const response = CStoreResponse.fromRequest(request);
    response.setStatus(Status.Success);

    callback(response);
  }

  // Handle incoming association release requests
  associationReleaseRequested(): void {
    this.sendAssociationReleaseResponse();
  }
}
