// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import { notifications, showNotification } from '@mantine/notifications';
import { MedplumClient, MedplumRequestOptions, normalizeErrorString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { MedplumLink } from '@medplum/react';
import { IconCheck, IconX } from '@tabler/icons-react';

type StartAsyncJobBody = Record<string, string[] | string | number | boolean>;

export function startAsyncJobAsync<T extends Resource>(
  medplum: MedplumClient,
  title: string,
  url: string,
  body?: StartAsyncJobBody
): Promise<T> {
  // Use a random ID rather than just `url` to facilitate multiple requests of the same type
  const notificationId = Date.now().toString();

  showNotification({
    id: notificationId,
    loading: true,
    title,
    message: 'Running...',
    autoClose: false,
    withCloseButton: false,
  });

  const options: MedplumRequestOptions = { method: 'POST', pollStatusOnAccepted: true };
  if (body) {
    options.body = JSON.stringify(body);
  }

  return medplum
    .startAsyncRequest<T>(url, options)
    .then((resource) => {
      let message: React.ReactNode = 'Done';
      if (resource.resourceType === 'AsyncJob') {
        message = <MedplumLink to={resource}>View AsyncJob</MedplumLink>;
      } else if (resource.resourceType === 'OperationOutcome' && resource.issue?.[0]?.details?.text) {
        message = <Text>{resource.issue[0].details.text}</Text>;
      }

      notifications.update({
        id: notificationId,
        color: 'green',
        title,
        message,
        icon: <IconCheck size="1rem" />,
        loading: false,
        autoClose: false,
        withCloseButton: true,
      });

      return resource;
    })
    .catch((err) => {
      notifications.update({
        id: notificationId,
        color: 'red',
        title,
        message: normalizeErrorString(err),
        icon: <IconX size="1rem" />,
        loading: false,
        autoClose: false,
        withCloseButton: true,
      });

      throw err;
    });
}

export function startAsyncJob(medplum: MedplumClient, title: string, url: string, body?: StartAsyncJobBody): void {
  // intentionally ignore errors
  startAsyncJobAsync(medplum, title, url, body).catch(() => {});
}
