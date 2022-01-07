import { HomerSimpsonHistory, MockClient } from '@medplum/mock';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { getTimeString, ResourceBlame, ResourceBlameProps } from './ResourceBlame';

const medplum = new MockClient();

describe('ResourceBlame', () => {
  function setup(args: ResourceBlameProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ResourceBlame {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('ResourceBlame renders', async () => {
    setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await screen.findByText('Loading...');
    expect(el).toBeDefined();
  });

  test('ResourceBlame renders preloaded history', async () => {
    setup({
      history: HomerSimpsonHistory,
    });

    const el = await screen.findAllByText('1');
    expect(el).toBeDefined();
    expect(el.length).not.toBe(0);
  });

  test('ResourceBlame renders after loading the resource', async () => {
    setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await screen.findAllByText('1');
    expect(el).toBeDefined();
    expect(el.length).not.toBe(0);
  });

  test('getTimeString', () => {
    expect(getTimeString(new Date(Date.now() - 1e3).toUTCString())).toEqual('1 second ago');
    expect(getTimeString(new Date(Date.now() - 2e3).toUTCString())).toEqual('2 seconds ago');
    expect(getTimeString(new Date(Date.now() - 60e3).toUTCString())).toEqual('1 minute ago');
    expect(getTimeString(new Date(Date.now() - 120e3).toUTCString())).toEqual('2 minutes ago');
    expect(getTimeString(new Date(Date.now() - 3600e3).toUTCString())).toEqual('1 hour ago');
    expect(getTimeString(new Date(Date.now() - 7200e3).toUTCString())).toEqual('2 hours ago');
    expect(getTimeString(new Date(Date.now() - 86400e3).toUTCString())).toEqual('1 day ago');
    expect(getTimeString(new Date(Date.now() - 172800e3).toUTCString())).toEqual('2 days ago');
    expect(getTimeString(new Date(Date.now() - 2592000e3).toUTCString())).toEqual('1 month ago');
    expect(getTimeString(new Date(Date.now() - 5184000e3).toUTCString())).toEqual('2 months ago');
    expect(getTimeString(new Date(Date.now() - 31536000e3).toUTCString())).toEqual('1 year ago');
    expect(getTimeString(new Date(Date.now() - 63072000e3).toUTCString())).toEqual('2 years ago');
  });
});
