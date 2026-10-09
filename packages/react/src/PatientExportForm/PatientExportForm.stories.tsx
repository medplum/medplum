// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { allOk, encodeSmartHealthLink } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { PatientExportForm } from './PatientExportForm';

export default {
  title: 'Medplum/PatientExportForm',
  component: PatientExportForm,
} as Meta;

const PLACEHOLDER_QR_CODE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAvCAYAAABzJ5OsAAAAAklEQVR4AewaftIAAAVKSURBVNXBUYpjRxAAwUyh+185/QqmoGmk2bX/HGEP/qfePFS+qfhGpUJlVKhUqIyKoVKxVFbFSaVC5ZuKNz8qbionlYqhUqGyVCpUKobKNxUqKqNCpWJV3FTGi4OKispJZVQMlQqVilXxScVQGSqnit+oqKicXvwllaFSoVKhslRGxVAZKhVDpaJCZVUslb/x5j9QqbhVqHyiMipUKkaFyn/x5lDxTcVJZVSoVKhUqFQslYqhUqFSMSp+U/HJmx8qf6JSoVKh8huViqVSoVKhUqFSoVKhUjFUvnnzqPgbFSoVKqtC5VaxVIbKqlBZFaNiVPzGHioVKreKoVKhcqpYKn9ScVKp+ETlVrHePCpWhcqoGCpD5aZyq1CpGCqjQuVUoVIxVFaFyk2l4s1DZVSoVKio3CpUPqk4qYyKobIqbioVKhUqFSoVKioVwx48VEbFSWVUqFSoVKiMiqGyKm4qo0JlVHyiUjFUbhUvflRUnFQqVsWoUFkqq2KpqAyVilVRoXJSWSoqFauiYrx4qAwVFRWVilGhslRGRUWFSoXKUKn4jUrFTWVUDJWKoaIy3vxQWRVDpUJlqNxUlkrFqUJlqCyVCpWKW4XKqFCpOL14VFSMCpVRMSpGxScVFRUqQ2VVjIqhMlQqVFRUfqOisuyhMipUThXfqHxTsVRWxVCpUKkYKhVLpeKmUvHmUqEyKpZKhcqoWBU3lQqVCpWKk8pQqahQWRVDpULlZA+VUaEyKlRGxVAZFX9DpUKlYqiMipPKqlBZFUulYtiDD1QqVFbFUKlYKhUqo2KpVCyViqHyScVJZVWoVNhDpULlNxUq/1XFUqlYKhUqv6lY9lAZFSqjYqlUqIyKoTIqlsqoWCoVQ+VWcVKpWCoVQ2VUvLhULJWlUnGrGCo3laWyKipGxVAZKkvlpFJRMV5cVFbFJyonlYpRsSq+UbmpVKyKpbJUhj34oVKhcqsYKhUqo0JlVKh8UnFTGRVL5ZOKoVIx3vxQGSqr4hOVilUxVFaFylKpWCq/qVCpuKlUvHmoVKhUDBWVU0WFylCpGCoVQ0VlVSyVUaFSoTIqRoVKxVJZFcMeKhXfqIyKoVJxU1kVQ2VUqFSofFMxVFaFyqnizQ+VUaFSobIqVoVKhcqqUDlVnFQqVFbFSaVCZah8Yg8OKqPiE5UKlVPFSWVUqIwKlVuFSoXKqeKkUjFeHFROKkNFZalUjIoKlaUyKlRGhUrFqBgVKhUqo6KiYqmonN78okKlYqhUrAqVilPFUKlQ+aRiqYyKofJJxbIHB5UKlVExVCo+UVkVJ5VRoVIxVFbFNyqjQqVCpeLFpWJVqIyKoaLySYWKylCpGCoVf6KyVCoqVIbKevOBSoVKxVCpqPikQqXiVqGisipUKoZKRYXKqBgqFTd78FA5VQyVUaEyKk4qFUvlb1QMlVvFUlkVKhVvHioVQ2WpVNxURsWo+JMKlYqTSsVJReVUsSqGPfgDlVGhUjFURoXKqWKprAqVVXFTqVgqo0KlYrx5qHxTUaEyKlbFrUJlqFSMilPFUKkYKieVilGhcnrzo+KmMlROKqNCZVQMlVVxUlkqo0JlVaiMiqUyKlQq3hxUVsWpQqViVKicVCpUVG4VS6VCpUJlqAyVU8WqGG/+hYqlUnFTqRgqFUOlYqhUqAyVUXFTqVAZFSoVL/4llYqKobIqlkqFispNpWJVqKioDJWKVaFSMV4cKioqThVDZajcVEaFylCpOKmMipNKRcVQqVAZFSoVyx4q31SojAqVW4XKqlA5VZxURsVQGRVDpWKojAqVimEP/qf+Ae3QPqyT/YcQAAAAAElFTkSuQmCC';

const medplum = new MockClient();

medplum.router.add('POST', 'Patient/:id/$generate-smart-health-link', async (req) => {
  const { exp, label } = req.body as { exp?: number; label?: string };
  const shlink = encodeSmartHealthLink({ url: 'https://example.com/shl/storybook', key: 'storybook', exp, label });
  const parameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'shlink', valueString: shlink },
      { name: 'qrCodeDataUrl', valueString: PLACEHOLDER_QR_CODE },
    ],
  };
  return [allOk, parameters];
});

export const Example = (): JSX.Element => (
  <MedplumProvider medplum={medplum}>
    <Document>
      <Title order={1}>Patient Export</Title>
      <PatientExportForm patient={HomerSimpson} />
    </Document>
  </MedplumProvider>
);
