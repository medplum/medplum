import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ExportButton, SearchExportDisplay } from './SearchExportDisplay';

describe('SearchExportDisplay', () => {
  test('Render not visible', () => {
    render(<SearchExportDisplay visible={false} onCancel={jest.fn()} />);

    expect(screen.queryByText('Export as CSV')).toBeNull();
  });

  test('Export as CSV and Export as FHIR Bundle rendered', async () => {
    render(
      <SearchExportDisplay
        exportCSV={() => console.log('export')}
        exportFHIRBundle={() => console.log('export')}
        visible={true}
        onCancel={jest.fn()}
      />
    );

    expect(screen.queryByText('Export as CSV')).not.toBeNull();
    expect(screen.queryByText('Export as FHIR Bundle')).not.toBeNull();
  });

  test('Export as CSV not rendered', async () => {
    render(<SearchExportDisplay exportFHIRBundle={() => console.log('export')} visible={true} onCancel={jest.fn()} />);

    expect(screen.queryByText('Export as CSV')).toBeNull();
    expect(screen.queryByText('Export as FHIR Bundle')).not.toBeNull();
  });

  test('Export as FHIR Bundle not rendered', async () => {
    render(<SearchExportDisplay exportCSV={() => console.log('export')} visible={true} onCancel={jest.fn()} />);

    expect(screen.queryByText('Export as CSV')).not.toBeNull();
    expect(screen.queryByText('Export as FHIR Bundle')).toBeNull();
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
