import { SearchRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SearchFieldEditor } from './SearchFieldEditor';

describe('SearchFieldEditor', () => {
  beforeAll(async () => {
    await new MockClient().requestSchema('Patient');
  });

  test('Render not visible', () => {
    const currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: ['name'],
    };

    render(<SearchFieldEditor search={currSearch} visible={false} onOk={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.queryByText('OK')).toBeNull();
  });

  test('Modal onClose not called when overlay clicked while dropdown open', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: [],
    };
    const onCancel = jest.fn();

    render(<SearchFieldEditor search={currSearch} visible={true} onOk={(e) => (currSearch = e)} onCancel={onCancel} />);

    // opens the dropdown
    await act(async () => {
      fireEvent.focus(screen.getByPlaceholderText('Select fields to display'));
    });

    // click the overlay
    await act(async () => {
      fireEvent.mouseDown(screen.getByTestId('overlay-child'));
      fireEvent.mouseUp(screen.getByTestId('overlay-child'));
      fireEvent.click(screen.getByTestId('overlay-child'));
    });

    expect(onCancel).not.toHaveBeenCalled();
  });

  test('Modal onClose called when overlay clicked while dropdown NOT open', async () => {
    let currSearch: SearchRequest = {
      resourceType: 'Patient',
      fields: [],
    };
    const onCancel = jest.fn();

    render(<SearchFieldEditor search={currSearch} visible={true} onOk={(e) => (currSearch = e)} onCancel={onCancel} />);

    // click the overlay
    await act(async () => {
      fireEvent.mouseDown(screen.getByTestId('overlay-child'));
      fireEvent.mouseUp(screen.getByTestId('overlay-child'));
      fireEvent.click(screen.getByTestId('overlay-child'));
    });

    expect(onCancel).toHaveBeenCalled();
  });
});
