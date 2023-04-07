export class GetCallerIdentityCommand {
  constructor(public readonly input: any) {}
}

export class STSClient {
  constructor(readonly config?: any) {}

  async send(command: any): Promise<any> {
    if (command instanceof GetCallerIdentityCommand) {
      if (this.config?.region === 'us-bad-1') {
        throw new Error('Invalid region');
      }
      return {};
    }

    return undefined;
  }
}
