import { HomerSimpsonHistory, MockClient } from '@medplum/mock';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { ResourceBlame, ResourceBlameProps } from './ResourceBlame';

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
});
