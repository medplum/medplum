import { Table } from '@mantine/core';
import { ResourceDiffRow, ResourceDiffRowProps } from './ResourceDiffRow';
import { act, render, screen } from '../test-utils/render';

describe('ResourceDiffRow', () => {
  function setup(props: ResourceDiffRowProps): void {
    render(
      <Table>
        <ResourceDiffRow {...props} />
      </Table>
    );
  }

  test('Text diff', async () => {
    await act(async () => {
      setup({
        key: 'key1',
        name: 'Add name',
        path: 'given',
        property: undefined,
        originalValue: { type: 'string', value: 'Bart' },
        revisedValue: { type: 'string', value: 'Homer' },
        shouldToggleDisplay: false,
      });
    });

    expect(await screen.findByText('Homer')).toBeInTheDocument();
  });

  test('Text Expand/Collapse', async () => {
    await act(async () => {
      setup({
        key: 'key1',
        name: 'Add name',
        path: 'given',
        property: undefined,
        originalValue: { type: 'string', value: 'Bart' },
        revisedValue: { type: 'string', value: 'Homer' },
        shouldToggleDisplay: true,
      });
    });

    expect(await screen.queryByText('Homer')).not.toBeInTheDocument();

    await act(async () => {
      const button = screen.getByText('Expand');
      button.click();
    });

    expect(await screen.queryByText('Homer')).toBeInTheDocument();

    await act(async () => {
      const button = screen.getByText('Collapse');
      button.click();
    });

    expect(await screen.queryByText('Homer')).not.toBeInTheDocument();
  });
});
