// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Loader } from '@mantine/core';
import { JSX } from 'react';

export function Loading(): JSX.Element {
  return (
    <Center style={{ width: '100%', height: '300px' }}>
      <Loader />
    </Center>
  );
}
