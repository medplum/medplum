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
        name: 'Add name',
        path: 'given',
        property: undefined,
        originalValue: { type: 'string', value: 'Bart' },
        revisedValue: { type: 'string', value: 'Homer' }
      });
    });

    expect(await screen.findByText('Homer')).toBeInTheDocument();
  });

  test('Text Expand/Collapse', async () => {
    await act(async () => {
      setup({
        "name": "Replace sourceCode",
        "path": "Bot.sourceCode",
        "property": {
          "description": "Bot source code",
          "path": "Bot.sourceCode",
          "min": 0,
          "max": 1,
          "isArray": false,
          "constraints": [],
          "type": [
            {
              "code": "Attachment"
            }
          ],
        },
        "originalValue": {
          "type": "Attachment",
          "value": {
            "contentType": "text/typescript",
            "title": "index.ts",
            "url": "http://example.com/new.pdf",
          }
        },
        "revisedValue": {
          "type": "Attachment",
          "value": {
            "contentType": "text/typescript",
             "url": "http://example.com/new.pdf",
             "title": "index.ts"
          }
        }
      });
    });

    expect(await screen.queryByText('Homer')).not.toBeInTheDocument();

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
        revisedValue: { type: 'string', value: 'Homer' }
      });
    });

    expect(await screen.queryByText('Expand')).not.toBeInTheDocument();
  });
});
