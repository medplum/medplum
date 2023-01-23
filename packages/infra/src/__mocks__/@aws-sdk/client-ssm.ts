export class PutParameterCommand {
  constructor(public readonly input: any) {}
}

export class SSMClient {
  async send(command: any): Promise<any> {
    if (command instanceof PutParameterCommand) {
      return {};
    }

    return undefined;
  }
}
