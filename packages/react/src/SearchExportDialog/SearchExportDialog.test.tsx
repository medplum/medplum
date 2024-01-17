import { act, fireEvent, render, screen } from '../test-utils/render';
import { ExportButton, SearchExportDialog } from './SearchExportDialog';

describe('SearchExportDialog', () => {
  test('Render not visible', () => {
    render(<SearchExportDialog visible={false} onCancel={jest.fn()} />);

    expect(screen.queryByText('Export as CSV')).toBeNull();
  });

  test('Export as CSV and Export as Bundle rendered', async () => {
    render(
      <SearchExportDialog
        exportCsv={() => console.log('export')}
        exportTransactionBundle={() => console.log('export')}
        visible={true}
        onCancel={jest.fn()}
      />
    );

    expect(screen.queryByText('Export as CSV')).not.toBeNull();
    expect(screen.queryByText('Export as Transaction Bundle')).not.toBeNull();
  });

  test('Export as CSV not rendered', async () => {
    render(
      <SearchExportDialog exportTransactionBundle={() => console.log('export')} visible={true} onCancel={jest.fn()} />
    );

    expect(screen.queryByText('Export as CSV')).toBeNull();
    expect(screen.queryByText('Export as Transaction Bundle')).not.toBeNull();
  });

  test('Export as Transaction Bundle not rendered', async () => {
    render(<SearchExportDialog exportCsv={() => console.log('export')} visible={true} onCancel={jest.fn()} />);

    expect(screen.queryByText('Export as CSV')).not.toBeNull();
    expect(screen.queryByText('Export as Transaction Bundle')).toBeNull();
  });
});

describe('ExportButton', () => {
  test('Render Export Button', async () => {
    console.log = jest.fn();

    render(
      <ExportButton text="CSV" exportLogic={() => console.log('export')} onCancel={() => console.log('cancel')} />
    );

    expect(screen.queryByText('Export as CSV')).not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText('Export as CSV'));
    });
    expect(console.log).toHaveBeenCalledWith('export');
  });
});
