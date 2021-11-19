import { MedplumClient } from '@medplum/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { MenuItem } from './MenuItem';
import { MenuSeparator } from './MenuSeparator';
import { SubMenu } from './SubMenu';

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: async () => undefined
});

const setup = (children: React.ReactNode) => {
  return render(
    <MedplumProvider medplum={medplum}>
      {children}
    </MedplumProvider>
  );
};

describe('SubMenu', () => {

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    setup(
      <MemoryRouter>
        <SubMenu title="SubMenu Test">
          <MenuItem onClick={() => undefined}>MenuItem Test</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => undefined}>2nd Item Test</MenuItem>
        </SubMenu>
      </MemoryRouter>
    );

    expect(screen.getByText('SubMenu Test')).not.toBeUndefined();
    expect(screen.getByTestId('popup').style.display).toEqual('none');
  });

  test('Opens on click', async () => {
    const onClick = jest.fn();

    setup(
      <MemoryRouter>
        <SubMenu title="SubMenu Test">
          <MenuItem onClick={onClick}>MenuItem Test</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => undefined}>2nd Item Test</MenuItem>
        </SubMenu>
      </MemoryRouter>
    );

    expect(screen.getByText('SubMenu Test')).not.toBeUndefined();

    await act(async () => {
      fireEvent.click(screen.getByText('SubMenu Test'));
    });

    expect(screen.getByTestId('popup').style.display).toEqual('block');
    expect(screen.getByText('MenuItem Test')).not.toBeUndefined();

    await act(async () => {
      fireEvent.click(screen.getByText('MenuItem Test'));
    });

    expect(onClick).toHaveBeenCalled();
  });

  test('Opens on hover', async () => {
    setup(
      <MemoryRouter>
        <SubMenu title="SubMenu Test">
          <MenuItem onClick={jest.fn()}>MenuItem Test</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={jest.fn()}>2nd Item Test</MenuItem>
        </SubMenu>
      </MemoryRouter>
    );

    expect(screen.getByText('SubMenu Test')).not.toBeUndefined();
    expect(screen.getByTestId('popup').style.display).toEqual('none');

    await act(async () => {
      fireEvent.mouseOver(screen.getByText('SubMenu Test'));
    });

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    await act(async () => {
      await waitFor(async () => expect(screen.getByTestId('popup').style.display).toEqual('block'));
    });

    expect(screen.getByTestId('popup').style.display).toEqual('block');

    await act(async () => {
      fireEvent.mouseLeave(screen.getByText('SubMenu Test'));
    });

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    await act(async () => {
      await waitFor(async () => expect(screen.getByTestId('popup').style.display).toEqual('none'));
    });

    expect(screen.getByTestId('popup').style.display).toEqual('none');
  });

});
