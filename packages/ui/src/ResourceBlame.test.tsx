import { HomerSimpsonHistory, MockClient } from '@medplum/mock';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { ResourceBlame, ResourceBlameProps } from './ResourceBlame';

const medplum = new MockClient();

describe('ResourceBlame', () => {
  const setup = (args: ResourceBlameProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <ResourceBlame {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('ResourceBlame renders', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await utils.findByText('Loading...');
    expect(el).toBeDefined();
  });

  test('ResourceBlame renders preloaded history', async () => {
    const utils = setup({
      history: HomerSimpsonHistory,
    });

    const el = await utils.findAllByText('1');
    expect(el).toBeDefined();
    expect(el.length).not.toBe(0);
  });

  test('ResourceBlame renders after loading the resource', async () => {
    const utils = setup({
      resourceType: 'Patient',
      id: '123',
    });

    const el = await utils.findAllByText('1');
    expect(el).toBeDefined();
    expect(el.length).not.toBe(0);
  });
});
