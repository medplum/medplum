export enum PackageType {
  Image = 'Image',
  Zip = 'Zip',
}

export class CreateFunctionCommand {
  constructor(public readonly input: any) {}
}

export class GetFunctionCommand {
  constructor(public readonly input: any) {}
}

export class GetFunctionConfigurationCommand {
  constructor(public readonly input: any) {}
}

export class ListLayerVersionsCommand {
  constructor(public readonly input: any) {}
}

export class UpdateFunctionCodeCommand {
  constructor(public readonly input: any) {}
}

export class UpdateFunctionConfigurationCommand {
  constructor(public readonly input: any) {}
}

export class InvokeCommand {
  constructor(public readonly input: any) {}
}

export class LambdaClient {
  static created = false;
  static updated = false;

  async send(command: any): Promise<any> {
    if (command instanceof CreateFunctionCommand) {
      LambdaClient.created = true;
      return {
        FunctionName: command.input.FunctionName,
      };
    }

    if (command instanceof GetFunctionCommand) {
      if (LambdaClient.created) {
        return {
          Configuration: {
            FunctionName: command.input.FunctionName,
          },
        };
      } else {
        throw new Error('Function not found');
      }
    }

    if (command instanceof GetFunctionConfigurationCommand) {
      return {
        FunctionName: command.input.FunctionName,
        Runtime: 'node16.x',
        Handler: 'index.handler',
        Layers: [
          {
            Arn: 'arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1',
          },
        ],
      };
    }

    if (command instanceof ListLayerVersionsCommand) {
      return {
        LayerVersions: [
          {
            LayerVersionArn: 'xyz',
          },
        ],
      };
    }

    if (command instanceof UpdateFunctionCodeCommand) {
      LambdaClient.updated = true;
      return {
        FunctionName: command.input.FunctionName,
      };
    }

    if (command instanceof InvokeCommand) {
      const decoder = new TextDecoder();
      const event = JSON.parse(decoder.decode(command.input.Payload));
      const output = typeof event.input === 'string' ? event.input : JSON.stringify(event.input);
      const encoder = new TextEncoder();

      // console.log('mock lambda client input', decoder.decode(command.input.Payload));
      // LogResult:
      // START RequestId: 146fcfcf-c32b-43f5-82a6-ee0f3132d873 Version: $LATEST
      // 2022-05-30T16:12:22.685Z	146fcfcf-c32b-43f5-82a6-ee0f3132d873	INFO test
      // END RequestId: 146fcfcf-c32b-43f5-82a6-ee0f3132d873
      // REPORT RequestId: 146fcfcf-c32b-43f5-82a6-ee0f3132d873
      return {
        LogResult: `U1RBUlQgUmVxdWVzdElkOiAxNDZmY2ZjZi1jMzJiLTQzZjUtODJhNi1lZTBmMzEzMmQ4NzMgVmVyc2lvbjogJExBVEVTVAoyMDIyLTA1LTMwVDE2OjEyOjIyLjY4NVoJMTQ2ZmNmY2YtYzMyYi00M2Y1LTgyYTYtZWUwZjMxMzJkODczCUlORk8gdGVzdApFTkQgUmVxdWVzdElkOiAxNDZmY2ZjZi1jMzJiLTQzZjUtODJhNi1lZTBmMzEzMmQ4NzMKUkVQT1JUIFJlcXVlc3RJZDogMTQ2ZmNmY2YtYzMyYi00M2Y1LTgyYTYtZWUwZjMxMzJkODcz`,
        Payload: encoder.encode(output),
      };
    }

    return undefined;
  }
}
