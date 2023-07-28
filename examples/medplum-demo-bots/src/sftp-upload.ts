import Client from 'ssh2-sftp-client';

/**
 * This Bot demonstrates Medplum's SFTP capabilities.
 * It uses the ssh2-sftp-client library to list all the files on a demo SFTP server.
 * @returns The data returned by the `list` command
 */
export async function handler(): Promise<Client.FileInfo[] | boolean> {
  console.log('SFTP test');
  let data: Client.FileInfo[] | undefined = undefined;
  try {
    const sftp = new Client();
    await sftp.connect({
      host: 'test.rebex.net',
      username: 'demo',
      password: 'password',
    });
    data = await sftp.list('.');
    console.log('data', data);
  } catch (err) {
    console.log('error', err);
    return false;
  }
  return data;
}
