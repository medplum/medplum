/**
 * Content type constants.
 */
export const ContentType = {
  CSS: 'text/css',
  FAVICON: 'image/vnd.microsoft.icon',
  FHIR_JSON: 'application/fhir+json',
  FORM_URL_ENCODED: 'application/x-www-form-urlencoded',
  HL7_V2: 'x-application/hl7-v2+er7',
  HTML: 'text/html',
  JAVASCRIPT: 'text/javascript',
  JSON: 'application/json',
  JSON_PATCH: 'application/json-patch+json',
  PNG: 'image/png',
  SVG: 'image/svg+xml',
  TEXT: 'text/plain',
  TYPESCRIPT: 'text/typescript',
} as const;

export type ContentTypeString = (typeof ContentType)[keyof typeof ContentType];
