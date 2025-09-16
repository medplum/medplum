// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Content type constants.
 */
export const ContentType = {
  CSS: 'text/css',
  DICOM: 'application/dicom',
  FAVICON: 'image/vnd.microsoft.icon',
  FHIR_JSON: 'application/fhir+json',
  FORM_URL_ENCODED: 'application/x-www-form-urlencoded',
  HL7_V2: 'x-application/hl7-v2+er7',
  HTML: 'text/html',
  JAVASCRIPT: 'text/javascript',
  JSON: 'application/json',
  JSON_PATCH: 'application/json-patch+json',
  JWT: 'application/jwt',
  MULTIPART_FORM_DATA: 'multipart/form-data',
  PNG: 'image/png',
  SCIM_JSON: 'application/scim+json',
  SVG: 'image/svg+xml',
  TEXT: 'text/plain',
  TYPESCRIPT: 'text/typescript',
  PING: 'x-application/ping',
  XML: 'text/xml',
  // See: https://www.iana.org/assignments/media-types/application/cda+xml
  CDA_XML: 'application/cda+xml',
} as const;
