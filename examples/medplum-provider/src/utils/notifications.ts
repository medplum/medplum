// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { IconCircleOff } from '@tabler/icons-react';
import React from 'react';

export const showErrorNotification = (err: unknown): void => {
  showNotification({
    color: 'red',
    icon: React.createElement(IconCircleOff),
    title: 'Error',
    message: normalizeErrorString(err),
  });
};
