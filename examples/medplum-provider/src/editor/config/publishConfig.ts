import type { MedplumClient } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import type { EditorConfiguration } from '../types';

const CONFIG_TYPE_SYSTEM = 'http://medplum.com/fhir/CodeSystem/document-type';
const CONFIG_TYPE_CODE = 'app-theme-config';

/**
 * Save the editor configuration as a FHIR DocumentReference.
 */
export async function publishEditorConfig(
  medplum: MedplumClient,
  config: EditorConfiguration
): Promise<DocumentReference> {
  const json = JSON.stringify(config);
  const base64 = btoa(unescape(encodeURIComponent(json)));

  const existing = await findExistingConfig(medplum);

  const docRef: DocumentReference = {
    resourceType: 'DocumentReference',
    status: 'current',
    type: {
      coding: [
        {
          system: CONFIG_TYPE_SYSTEM,
          code: CONFIG_TYPE_CODE,
          display: 'Application Theme Configuration',
        },
      ],
    },
    description: config.meta.name,
    date: new Date().toISOString(),
    content: [
      {
        attachment: {
          contentType: 'application/json',
          data: base64,
        },
      },
    ],
  };

  if (existing?.id) {
    return medplum.updateResource({ ...docRef, id: existing.id });
  }
  return medplum.createResource(docRef);
}

/**
 * Load the published editor configuration from FHIR.
 */
export async function loadEditorConfig(medplum: MedplumClient): Promise<EditorConfiguration | null> {
  const docRef = await findExistingConfig(medplum);
  if (!docRef?.content?.[0]?.attachment?.data) {
    return null;
  }

  const json = decodeURIComponent(escape(atob(docRef.content[0].attachment.data)));
  return JSON.parse(json) as EditorConfiguration;
}

async function findExistingConfig(medplum: MedplumClient): Promise<DocumentReference | undefined> {
  return medplum.searchOne('DocumentReference', {
    type: `${CONFIG_TYPE_SYSTEM}|${CONFIG_TYPE_CODE}`,
    status: 'current',
  });
}
