// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../../test-utils/render';
import { ComponentPreview } from './ComponentPreview';

const simpleCode = `import { Text } from '@mantine/core';

export default function Demo(): JSX.Element {
  return <Text>Hello preview</Text>;
}
`;

describe('ComponentPreview', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function setup(ui: JSX.Element): ReturnType<typeof render> {
    return render(<MedplumProvider medplum={medplum}>{ui}</MedplumProvider>);
  }

  test('Renders the live preview by default', async () => {
    setup(<ComponentPreview code={simpleCode} />);

    // Only the active panel is exposed to the accessibility tree, so a tabpanel
    // query resolves to whichever tab is currently selected.
    const panel = await waitFor(() => screen.getByRole('tabpanel'));
    expect(panel).toHaveTextContent('Hello preview');
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Renders a component declared as an arrow function', async () => {
    const arrowCode = `const Demo = () => <Text>Arrow preview</Text>;\n\nexport default Demo;\n`;
    setup(<ComponentPreview code={arrowCode} />);

    await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveTextContent('Arrow preview'));
  });

  test('Shows the untransformed source on the Code tab', async () => {
    setup(<ComponentPreview code={simpleCode} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));

    const panel = await waitFor(() => screen.getByRole('tabpanel'));
    // The code tab shows the original source, imports and `export default` included.
    expect(panel).toHaveTextContent("import { Text } from '@mantine/core';");
    expect(panel).toHaveTextContent('export default function Demo()');
  });

  test('Omits the Resources tab when there are no resources', () => {
    setup(<ComponentPreview code={simpleCode} />);
    expect(screen.queryByRole('tab', { name: 'Resources' })).not.toBeInTheDocument();

    setup(<ComponentPreview code={simpleCode} resources={[]} />);
    expect(screen.queryByRole('tab', { name: 'Resources' })).not.toBeInTheDocument();
  });

  test('Renders resources and reports clicks', async () => {
    const reference = `Patient/${HomerSimpson.id}`;
    const onResourceClick = vi.fn();
    setup(<ComponentPreview code={simpleCode} resources={[reference]} onResourceClick={onResourceClick} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Resources' }));

    const box = await screen.findByTestId('resource-box');
    expect(box).toHaveTextContent('Patient');

    fireEvent.click(box);
    expect(onResourceClick).toHaveBeenCalledWith(reference);
  });

  test('Renders resources without an onResourceClick handler', async () => {
    const reference = `Patient/${HomerSimpson.id}`;
    setup(<ComponentPreview code={simpleCode} resources={[reference]} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Resources' }));

    const box = await screen.findByTestId('resource-box');
    // The default no-op click handler must not throw.
    expect(() => fireEvent.click(box)).not.toThrow();
  });

  test('Surfaces render errors instead of crashing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const brokenCode = `export default function Demo(): JSX.Element {
  return <Text>{missingVariable}</Text>;
}
`;

    setup(<ComponentPreview code={brokenCode} />);

    await waitFor(() => expect(screen.getByText(/missingVariable/)).toBeInTheDocument());
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent('Hello preview');
    consoleError.mockRestore();
  });

  test('Reports the missing render call when the code declares no component', async () => {
    setup(<ComponentPreview code={`const value = 1;\n`} />);

    // No detectable component name means no `render(...)` call is appended, which
    // react-live rejects in noInline mode rather than rendering an empty preview.
    await waitFor(() => expect(screen.getByText(/must call `render`/)).toBeInTheDocument());
  });
});
