// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { MedplumClient } from '@medplum/core';
import { Media, Patient } from '@medplum/fhirtypes';
// end-block imports

const medplum = new MedplumClient();
let myFile: any;

{
  // start-block downloadBinary
  const patient: Patient = {
    resourceType: 'Patient',
    photo: [
      {
        contentType: 'image/jpeg',
        url: 'https://storage.medplum.com/binary/12345',
      },
    ],
  };

  // A function to return the binary id
  const binaryUrl = getBinaryId(patient.photo?.[0].url);
  // Download the binary
  await medplum.download(`Binary/${binaryUrl}`);
  // end-block downloadBinary
}

function getBinaryId(url?: string): string {
  if (!url) {
    throw new Error('Invalid url');
  }

  const parts: string[] = url.split('/');
  const id = parts[parts.length - 1];
  return id;
}

{
  // start-block createBinary
  const medplum = new MedplumClient({
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET',
  });

  const binary = await medplum.createBinary({
    data: myFile,
    filename: 'test.jpg',
    contentType: 'image/jpeg',
  });
  console.log(binary.id);
  //end-block createBinary
}

{
  // start-block profilePhoto
  const photo = await medplum.createAttachment({
    data: myFile,
    filename: 'test.jpg',
    contentType: 'image/jpeg',
  });

  const patient = await medplum.createResource({
    resourceType: 'Patient',
    photo: [photo],
  });
  // end-block profilePhoto

  console.log(patient);
}

{
  // start-block messageAttachment
  const document = await medplum.createAttachment({
    data: myFile,
    filename: 'test.pdf',
    contentType: 'application/pdf',
  });

  const communication = await medplum.createResource({
    resourceType: 'Communication',
    status: 'completed',
    payload: [{ contentAttachment: document }],
  });
  // end-block messageAttachment

  console.log(communication);
}

{
  /*
  // start-block mediaImport
  import { Media } from '@medplum/fhirtypes';

  // end-block mediaImport
  */

  // start-block externalUrl
  // Create a Media Resource
  const MEDIA_URL = 'https://images.unsplash.com/photo-1581385339821-5b358673a883';
  const media: Media = {
    resourceType: 'Media',
    basedOn: [
      {
        reference: 'ServiceRequest/12345',
      },
    ],
    status: 'completed', // `status` is a required field
    content: {
      title: 'plums-ts.jpg',
      contentType: 'image/jpeg',
      url: MEDIA_URL,
    },
  };

  await medplum.createResource(media);
  // end-block externalUrl
}
