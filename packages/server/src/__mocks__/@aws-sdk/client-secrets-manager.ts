export class GetSecretValueCommand {
  constructor(public readonly input: any) {}
}

export class SecretsManagerClient {
  async send(command: any): Promise<any> {
    if (command instanceof GetSecretValueCommand) {
      return {
        SecretString: JSON.stringify({ host: 'host', port: 123 }),
      };
    }

    return undefined;
  }
}
