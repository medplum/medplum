// start-block imports
import { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
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

const medplum = useMedplum();
// A function to return the url in 'Binary/{id}' format
const binaryUrl = parsePresignedUrl(patient.photo?.[0].url);
// Download the binary
medplum.download(binaryUrl);
// end-block downloadBinary

function parsePresignedUrl(url?: string): string {
  return 'Binary/example-id';
}
