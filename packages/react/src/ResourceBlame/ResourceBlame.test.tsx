import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '../test-utils/render';
import { MemoryRouter } from 'react-router-dom';
import { ResourceBlame, ResourceBlameProps } from './ResourceBlame';
import { getTimeString } from './ResourceBlame.utils';

const medplum = new MockClient();

describe('ResourceBlame', () => {
  async function setup(args: ResourceBlameProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <ResourceBlame {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('ResourceBlame renders preloaded history', async () => {
    const history = await medplum.readHistory('Patient', '123');
    await setup({
      history,
    });

    const el = await screen.findAllByText('1');
    expect(el).toBeDefined();
    expect(el.length).not.toBe(0);
  });

  test('ResourceBlame renders after loading the resource', async () => {
    await setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await screen.findAllByText('1');
    expect(el).toBeDefined();
    expect(el.length).not.toBe(0);
  });

  test('getTimeString', () => {
    jest.useFakeTimers();
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
    jest.useRealTimers();
  });
});
