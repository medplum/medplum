// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block coreImports
import { BotEvent, MedplumClient } from '@medplum/core';
// end-block coreImports
// start-block sftpImport
import Client from 'ssh2-sftp-client';

// end-block sftpImport
// start-block formImports
import FormData from 'form-data';
import fetch from 'node-fetch';

// end-block formImports

// start-block botFn
export async function handler(medplum: MedplumClient, _event: BotEvent): Promise<any> {
  // Create the PDF
  // end-block botFn

  // start-block createPdf
  const binary = await medplum.createPdf({
    docDefinition: {
      content: ['Hello Medplum'],
    },
  });
  console.log('Binary result', JSON.stringify(binary, null, 2));
  // end-block createPdf

  // start-block checkBinary

  if (!binary.url) {
    throw new Error('Binary is missing');
  }

  // end-block checkBinary

  // start-block downloadPdf
  // Download the PDF
  const pdfData = await medplum.download(binary.url);
  const pdfStream = pdfData.stream();
  // end-block downloadPdf
  console.log(pdfStream);

  // start-block nl

  // end-block nl

  // start-block formData
  // Create a multipart form body
  const form = new FormData();
  form.append('otherValue', 'hello medplum');
  form.append('testPdf', pdfStream);
  // end-block formData

  // start-block postForm
  // Post the form
  const response = await fetch('https://httpbin.org/post', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });
  // end-block postForm

  console.log(response);

  // start-block closeFn

  // Show the JSON response
  const json = await response.json();
  console.log('response', json);
  return json;
}
// end-block closeFn

// start-block sftpBot
export async function sftpHandler(_medplum: MedplumClient, _event: BotEvent): Promise<any> {
  console.log('SFTP test');
  let data: any;
  try {
    const sftp = new Client();
    // Connect to the SFTP server
    // 'test.rebex.net' is a publicly available test server
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
// end-block sftpBot
