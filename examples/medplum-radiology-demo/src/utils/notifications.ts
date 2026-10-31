// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { notifications } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { IconCircleOff } from '@tabler/icons-react';
import React from 'react';

export const showErrorNotification = (err: unknown): void => {
  notifications.show({
    color: 'red',
    icon: React.createElement(IconCircleOff),
    title: 'Error',
    message: normalizeErrorString(err),
  });
};
