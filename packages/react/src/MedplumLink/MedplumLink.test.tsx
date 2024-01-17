import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '../test-utils/render';
import { MedplumLink } from './MedplumLink';

function mockFetch(url: string, options: any): Promise<any> {
  const response: any = {
    request: {
      url,
      options,
    },
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response),
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch,
});

function setup(ui: ReactElement): void {
  Object.defineProperty(window, 'location', {
    value: {
      assign: jest.fn(),
    },
    writable: true,
  });

  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>{ui}</MedplumProvider>
    </MemoryRouter>
  );
}

describe('MedplumLink', () => {
  test('Renders', () => {
    setup(<MedplumLink>test</MedplumLink>);
    expect(screen.getByText('test')).toBeDefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/#');
  });

  test('Renders unknown target', () => {
    setup(<MedplumLink to={{}}>test</MedplumLink>);
    expect(screen.getByText('test')).toBeDefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/#');
  });

  test('Renders string target', () => {
    setup(<MedplumLink to="xyz">test</MedplumLink>);
    expect(screen.getByText('test')).toBeDefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/xyz');
  });

  test('Renders resource target', () => {
    setup(<MedplumLink to={{ resourceType: 'Patient', id: '123' }}>test</MedplumLink>);
    expect(screen.getByText('test')).toBeDefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/Patient/123');
  });

  test('Renders reference target', () => {
    setup(<MedplumLink to={{ reference: 'Patient/123' }}>test</MedplumLink>);
    expect(screen.getByText('test')).toBeDefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/Patient/123');
  });

  test('Renders with suffix', () => {
    setup(
      <MedplumLink to={{ reference: 'Patient/123' }} suffix="foo">
        test
      </MedplumLink>
    );
    expect(screen.getByText('test')).toBeDefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/Patient/123/foo');
  });

  test('Handles click with onClick', () => {
    const onClick = jest.fn();
    setup(
      <MedplumLink to="xyz" onClick={onClick}>
        test
      </MedplumLink>
    );
    expect(screen.getByText('test')).toBeDefined();
    fireEvent.click(screen.getByText('test'));
    expect(onClick).toHaveBeenCalled();
  });

  test('Handles click with router', () => {
    setup(<MedplumLink to="xyz">test</MedplumLink>);
    expect(screen.getByText('test')).toBeDefined();
    fireEvent.click(screen.getByText('test'));
  });

  test('Handles click with no listeners', () => {
    setup(<MedplumLink>test</MedplumLink>);
    expect(screen.getByText('test')).toBeDefined();
    fireEvent.click(screen.getByText('test'));
  });
});
