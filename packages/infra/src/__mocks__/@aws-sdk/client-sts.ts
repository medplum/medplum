export class GetCallerIdentityCommand {
  constructor(public readonly input: any) {}
}

export class STSClient {
  async send(command: any): Promise<any> {
    if (command instanceof GetCallerIdentityCommand) {
      return {};
    }

    return undefined;
  }
}
