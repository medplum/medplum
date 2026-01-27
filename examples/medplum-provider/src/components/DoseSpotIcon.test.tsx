// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { DoseSpotIcon } from './DoseSpotIcon';

describe('DoseSpotIcon', () => {
  function setup(): ReturnType<typeof render> {
    return render(
      <MantineProvider>
        <DoseSpotIcon />
      </MantineProvider>
    );
  }

  test('Renders the pill icon', () => {
    const { container } = setup();

    const icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();
  });

  test('Renders icon with correct size', () => {
    const { container } = setup();

    const icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toHaveAttribute('width', '20');
    expect(icon).toHaveAttribute('height', '20');
  });
});
