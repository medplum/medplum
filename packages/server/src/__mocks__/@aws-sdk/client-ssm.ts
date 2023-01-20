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
          ],
        };
      }
      throw new Error('Parameters not found');
    }

    return undefined;
  }
}
