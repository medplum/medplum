export default class SftpClient {
  connectionStatus: boolean;

  constructor() {
    this.connectionStatus = false;
  }

  connect(options: any) {
    this.connectionStatus = true;
  }

  createReadStream() {
    return undefined;
  }

  put(): Promise<string> {
    return Promise.resolve('success');
  }

  list(remoteFilePath: string): Promise<any> {
    return Promise.resolve([]);
  }
}
