// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { SmartLogo } from './SmartLogo';

describe('SmartLogo', () => {
  function setupSvg(element: React.ReactElement): SVGSVGElement {
    const { container } = render(element);
    const svg = container.querySelector('svg');
    if (!svg) {
      throw new Error('Expected an svg');
    }
    return svg;
  }

  test('Renders at the default size', () => {
    const svg = setupSvg(<SmartLogo />);

    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
    // The viewBox is fixed, so only width/height scale the mark.
    expect(svg).toHaveAttribute('viewBox', '0 0 40 40');
  });

  test('Renders at a custom size', () => {
    const svg = setupSvg(<SmartLogo size={40} />);

    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
  });

  test('Paths inherit the color prop', () => {
    const svg = setupSvg(<SmartLogo color="var(--mantine-color-blue-6)" />);

    expect(svg).toHaveAttribute('color', 'var(--mantine-color-blue-6)');
    const paths = svg.querySelectorAll('path');
    expect(paths).toHaveLength(5);
    for (const path of paths) {
      expect(path).toHaveAttribute('fill', 'currentColor');
    }
  });

  test('Is decorative and not focusable', () => {
    const svg = setupSvg(<SmartLogo />);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });
});
