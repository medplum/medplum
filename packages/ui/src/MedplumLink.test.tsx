import { MedplumClient } from '@medplum/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumLink } from './MedplumLink';
import { MedplumProvider } from './MedplumProvider';

const mockRouter = {
  push: jest.fn(),
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  const response: any = {
    request: {
      url,
      options
    }
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

const setup = (ui: React.ReactElement) => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      {ui}
    </MedplumProvider>
  );
};

describe('MedplumLink', () => {

  test('Renders', () => {
    setup(<MedplumLink>test</MedplumLink>);
    expect(screen.getByText('test')).not.toBeUndefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/#');
  });

  test('Renders unknown target', () => {
    setup(<MedplumLink to={{}}>test</MedplumLink>);
    expect(screen.getByText('test')).not.toBeUndefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/#');
  });

  test('Renders string target', () => {
    setup(<MedplumLink to="xyz">test</MedplumLink>);
    expect(screen.getByText('test')).not.toBeUndefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/xyz');
  });

  test('Renders resource target', () => {
    setup(<MedplumLink to={{ resourceType: 'Patient', id: '123' }}>test</MedplumLink>);
    expect(screen.getByText('test')).not.toBeUndefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/Patient/123');
  });

  test('Renders reference target', () => {
    setup(<MedplumLink to={{ reference: 'Patient/123' }}>test</MedplumLink>);
    expect(screen.getByText('test')).not.toBeUndefined();
    expect((screen.getByText('test') as HTMLAnchorElement).href).toEqual('http://localhost/Patient/123');
  });

  test('Handles click with onClick', () => {
    const onClick = jest.fn();
    setup(<MedplumLink to="xyz" onClick={onClick}>test</MedplumLink>);
    expect(screen.getByText('test')).not.toBeUndefined();
    fireEvent.click(screen.getByText('test'));
    expect(onClick).toHaveBeenCalled();
  });

  test('Handles click with router', () => {
    mockRouter.push = jest.fn();
    setup(<MedplumLink to="xyz">test</MedplumLink>);
    expect(screen.getByText('test')).not.toBeUndefined();
    fireEvent.click(screen.getByText('test'));
    expect(mockRouter.push).toHaveBeenCalled();
  });

  test('Handles click with no listeners', () => {
    setup(<MedplumLink>test</MedplumLink>);
    expect(screen.getByText('test')).not.toBeUndefined();
    fireEvent.click(screen.getByText('test'));
  });

});
