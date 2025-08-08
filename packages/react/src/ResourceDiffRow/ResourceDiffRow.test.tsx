// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Table } from '@mantine/core';
import { act, render, screen } from '../test-utils/render';
import { ResourceDiffRow, ResourceDiffRowProps } from './ResourceDiffRow';

describe('ResourceDiffRow', () => {
  function setup(props: ResourceDiffRowProps): void {
    render(
      <Table>
        <Table.Tbody>
          <ResourceDiffRow {...props} />
        </Table.Tbody>
      </Table>
    );
  }

  test('Text diff', async () => {
    await act(async () => {
      setup({
        name: 'Add name',
        path: 'given',
        property: undefined,
        originalValue: { type: 'string', value: 'Bart' },
        revisedValue: { type: 'string', value: 'Homer' },
      });
    });

    expect(await screen.findByText('Homer')).toBeInTheDocument();
  });

  test('Text Expand/Collapse', async () => {
    await act(async () => {
      setup({
        name: 'Replace sourceCode',
        path: 'Bot.sourceCode',
        property: {
          description: 'Bot source code',
          path: 'Bot.sourceCode',
          min: 0,
          max: 1,
          type: [
            {
              code: 'Attachment',
            },
          ],
        },
        originalValue: {
          type: 'Attachment',
          value: {
            contentType: 'text/typescript',
            title: 'old.ts',
            url: 'http://example.com/old.pdf',
          },
        },
        revisedValue: {
          type: 'Attachment',
          value: {
            contentType: 'text/typescript',
            url: 'http://example.com/new.ts',
            title: 'new.ts',
          },
        },
      });
    });

    await act(async () => {
      const button = screen.getByText('Expand');
      button.click();
    });

    expect(await screen.queryByText('Expand')).not.toBeInTheDocument();
  });

  test('No Attachmentcd diff - No Expand button', async () => {
    await act(async () => {
      setup({
        name: 'Add name',
        path: 'given',
        property: undefined,
        originalValue: { type: 'string', value: 'Bart' },
        revisedValue: { type: 'string', value: 'Homer' },
      });
    });

    expect(await screen.queryByText('Expand')).not.toBeInTheDocument();
  });
});
