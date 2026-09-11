// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert } from '@mantine/core';
import type { Decorator } from '@storybook/react';

export const withSchedulingHeader: Decorator = (Story, Context) => {
  const { fileName } = Context.parameters;

  if (fileName.includes('react-scheduling')) {
    return (
      <>
        <Alert mb="md">
          This component is part of the <code>@medplum/react-scheduling</code> package.
        </Alert>
        <Story />
      </>
    );
  }

  return <Story />;
};
