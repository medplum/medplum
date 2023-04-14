export class GetParametersByPathCommand {
  constructor(public readonly input: any) {}
}

export class SSMClient {
  async send(command: any): Promise<any> {
    if (command instanceof GetParametersByPathCommand) {
      if (command.input.Path === 'test') {
        return {
          Parameters: [
            { Name: 'baseUrl', Value: 'https://www.example.com/' },
            { Name: 'DatabaseSecrets', Value: 'DatabaseSecretsArn' },
            { Name: 'RedisSecrets', Value: 'RedisSecretsArn' },
            { Name: 'port', Value: '8080' },
            { Name: 'botCustomFunctionsEnabled', Value: 'true' },
            { Name: 'logAuditEvents', Value: 'true' },
            { Name: 'registerEnabled', Value: 'false' },
          ],
        };
      }
      throw new Error('Parameters not found');
    }

    return undefined;
  }
}
