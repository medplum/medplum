import { showNotification } from '@mantine/notifications';
import { IconCircleOff } from '@tabler/icons-react';
import { normalizeErrorString } from '@medplum/core';
import React from 'react';

export const showErrorNotification = (err: unknown): void => {
  showNotification({
    color: 'red',
    icon: React.createElement(IconCircleOff),
    title: 'Error',
    message: normalizeErrorString(err),
  });
};
