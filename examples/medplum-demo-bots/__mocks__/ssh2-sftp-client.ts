export default class SftpClient {
  connectionStatus: boolean;

  constructor() {
    this.connectionStatus = false;
  }

  connect(_options: any): void {
    this.connectionStatus = true;
  }

  createReadStream(): undefined {
    return undefined;
  }

  put(): Promise<string> {
    return Promise.resolve('success');
  }

  list(_remoteFilePath: string): Promise<any> {
    return Promise.resolve([]);
  }
}
