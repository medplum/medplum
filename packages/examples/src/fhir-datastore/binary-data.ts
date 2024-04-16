// start-block imports
import { MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
// end-block imports

// start-block downloadBinary
const patient: Patient = {
  resourceType: 'Patient',
  photo: [
    {
      contentType: 'image/jpeg',
      url: 'https://storage.medplum.com/12345?token=...',
    },
  ],
};

const medplum = new MedplumClient();

// A function to return the url in 'Binary/{id}' format
const binaryUrl = parsePresignedUrl(patient.photo?.[0].url);
// Download the binary
medplum.download(binaryUrl);
// end-block downloadBinary

function parsePresignedUrl(url?: string): string {
  return 'Binary/example-id';
}
