export default class SftpClient {

  connectionStatus: boolean;

  constructor() {
    this.connectionStatus = false;
  }

  connect(options: any) {
    console.log('😍');
    this.connectionStatus = true;
  }

  createReadStream() {
    console.log('😍');

    return undefined;
  }

  put(): Promise<string> {
    console.log('😍');
    return Promise.resolve('success');
  }

  list(remoteFilePath: string): Promise<any> {
    console.log('😍');
    if (remoteFilePath.includes('out')) {
      return Promise.resolve([
        { name: '111111.oru', type: '-' },
        { name: '222222.oru', type: '-' },
      ]);
    } else {
      return Promise.resolve([]);
    }
  }
}
