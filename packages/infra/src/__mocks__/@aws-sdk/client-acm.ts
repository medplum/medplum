export class CertificateSummary {
  constructor(public readonly input: any) {}
}

export class ListCertificatesCommand {
  constructor(public readonly input: any) {}
}

export class RequestCertificateCommand {
  constructor(public readonly input: any) {}
}

export class ACMClient {
  async send(command: any): Promise<any> {
    if (command instanceof ListCertificatesCommand) {
      return {
        CertificateSummaryList: [
          {
            DomainName: 'example.com',
          },
        ],
      };
    }

    if (command instanceof RequestCertificateCommand) {
      return {
        CertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
      };
    }

    return undefined;
  }
}
