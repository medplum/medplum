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
  constructor(readonly config?: any) {}

  async send(command: any): Promise<any> {
    if (command instanceof ListCertificatesCommand) {
      if (this.config?.region === 'us-bad-1') {
        throw new Error('Invalid region');
      }
      return {
        CertificateSummaryList: [
          {
            DomainName: 'example.com',
          },
          {
            CertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789013',
            DomainName: 'api.existing.example.com',
          },
        ],
      };
    }

    if (command instanceof RequestCertificateCommand) {
      if (this.config?.region === 'us-bad-1') {
        throw new Error('Invalid region');
      }
      return {
        CertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
      };
    }

    return undefined;
  }
}
