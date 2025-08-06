// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';

export function DeletePage(): JSX.Element {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const navigate = useNavigate();

  return (
    <Document>
      <p>Are you sure you want to delete this {resourceType}?</p>
      <Button
        color="red"
        onClick={() => {
          medplum
            .deleteResource(resourceType, id)
            .then(() => navigate(`/${resourceType}`)?.catch(console.error))
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
        }}
      >
        Delete
      </Button>
    </Document>
  );
}
