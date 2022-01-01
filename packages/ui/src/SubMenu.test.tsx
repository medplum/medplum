import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { MenuItem } from './MenuItem';
import { MenuSeparator } from './MenuSeparator';
import { SubMenu } from './SubMenu';

const medplum = new MockClient();

function setup(children: React.ReactNode): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    </MemoryRouter>
  );
}

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
      <SubMenu title="SubMenu Test">
        <MenuItem onClick={() => undefined}>MenuItem Test</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => undefined}>2nd Item Test</MenuItem>
      </SubMenu>
    );

    expect(screen.getByText('SubMenu Test')).toBeDefined();
    expect(screen.getByTestId('popup').style.display).toEqual('none');
  });

  test('Opens on click', async () => {
    const onClick = jest.fn();

    setup(
      <SubMenu title="SubMenu Test">
        <MenuItem onClick={onClick}>MenuItem Test</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => undefined}>2nd Item Test</MenuItem>
      </SubMenu>
    );

    expect(screen.getByText('SubMenu Test')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('SubMenu Test'));
    });

    expect(screen.getByTestId('popup').style.display).toEqual('block');
    expect(screen.getByText('MenuItem Test')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('MenuItem Test'));
    });

    expect(onClick).toHaveBeenCalled();
  });

  test('Opens on hover', async () => {
    setup(
      <SubMenu title="SubMenu Test">
        <MenuItem onClick={jest.fn()}>MenuItem Test</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={jest.fn()}>2nd Item Test</MenuItem>
      </SubMenu>
    );

    expect(screen.getByText('SubMenu Test')).toBeDefined();
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

  test('Close when click outside of popup', async () => {
    setup(
      <SubMenu title="Parent">
        <MenuItem onClick={() => undefined}>Child</MenuItem>
      </SubMenu>
    );

    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.getByTestId('popup').style.display).toEqual('none');

    await act(async () => {
      fireEvent.click(screen.getByText('Parent'));
    });

    expect(screen.getByTestId('popup').style.display).toEqual('block');

    await act(async () => {
      fireEvent.click(document.body);
    });

    expect(screen.getByTestId('popup').style.display).toEqual('none');
  });
});
