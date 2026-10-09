// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../useAppNavigate';

export function DeletePage(): JSX.Element {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const navigate = useAppNavigate();

  return (
    <Document>
      <p>Are you sure you want to delete this {resourceType}?</p>
      <Button
        color="red"
        onClick={() => {
          medplum
            .deleteResource(resourceType, id)
            .then(() => navigate(`/${resourceType}`))
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
        }}
      >
        Delete
      </Button>
    </Document>
  );
}
