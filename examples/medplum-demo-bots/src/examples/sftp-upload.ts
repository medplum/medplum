import Client from 'ssh2-sftp-client';

/**
 * This Bot demonstrates Medplum's SFTP capabilities.
 * It uses the ssh2-sftp-client library to list all the files on a demo SFTP server
 * @param medplum - The Medplum Client object (unused)
 * @param event - The BotEvent object (unused)
 * @returns - The data returned by the `list` command
 */
export async function handler(): Promise<any> {
  console.log('SFTP test');
  let data: any | undefined = undefined;
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
