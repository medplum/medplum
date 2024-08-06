import { useMemo } from 'react';

// Maintain a cache of urls to avoid unnecessary re-download of attachments
// The following is a workaround for the fact that each request to a resource containing a Binary data reference
// returns a NEW signed S3 URL for each bypassing the native browser caching mechanism
// resulting in unnecessary bandwidth consumption.
// https://www.medplum.com/docs/fhir-datastore/binary-data#consuming-a-fhir-binary-in-an-application
// https://github.com/medplum/medplum/issues/3815

// TODO: possibly retain this cache in and restore from local storage to persist across page refreshes?
// The S3 presigned URLs expire after 1 hour with the default configuration and hard refreshes are not uncommon even in SPAs so this
// could be a good way to get additional cache hits
// This would require additional logic for initialization, saving, and purging of expired keys
const urls = new Map<string, string>();

export const useCachedBinaryUrl = (binaryUrl: string | undefined): string | undefined => {
  return useMemo(() => {
    if (!binaryUrl) {
      return undefined;
    }

    const binaryResourceUrl = binaryUrl.split('?')[0];
    if (!binaryResourceUrl) {
      return binaryUrl;
    }

    // Check if the binaryUrl is a presigned S3 URL
    let binaryUrlSearchParams: URLSearchParams;
    try {
      binaryUrlSearchParams = new URLSearchParams(new URL(binaryUrl).search);
    } catch (_err) {
      return binaryUrl;
    }

    if (!binaryUrlSearchParams.has('Key-Pair-Id') || !binaryUrlSearchParams.has('Signature')) {
      return binaryUrl;
    }

    // https://stackoverflow.com/questions/23929145/how-to-test-if-a-given-time-stamp-is-in-seconds-or-milliseconds
    const binaryUrlExpires = binaryUrlSearchParams.get('Expires');
    if (!binaryUrlExpires || binaryUrlExpires.length > 13) {
      // Expires is expected to be in seconds, not milliseconds
      return binaryUrl;
    }

    const cachedUrl = urls.get(binaryResourceUrl);
    if (cachedUrl) {
      const searchParams = new URLSearchParams(new URL(cachedUrl).search);

      // This is fairly brittle as it relies on the current structure of the Medplum returned URL
      const expires = searchParams.get('Expires');

      // `expires` is in seconds, Date.now() is in ms
      // Add padding to mitigate expiration between time of check and time of use
      if (expires && parseInt(expires, 10) * 1000 - 5_000 > Date.now()) {
        return cachedUrl;
      }
    }

    urls.set(binaryResourceUrl, binaryUrl);
    return binaryUrl;
  }, [binaryUrl]);
};
