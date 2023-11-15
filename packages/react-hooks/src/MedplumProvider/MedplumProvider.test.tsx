import { getDisplayString, MedplumClient, ProfileResource } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { MockAsyncClientStorage } from '../__mocks__';
import { MedplumProvider } from './MedplumProvider';
import { useMedplum, useMedplumContext, useMedplumNavigate, useMedplumProfile } from './MedplumProvider.context';

describe('MedplumProvider', () => {
  test('Renders component', () => {
    function MyComponent(): JSX.Element {
      const medplum = useMedplum();
      const context = useMedplumContext();
      const navigate = useMedplumNavigate();
      const profile = useMedplumProfile();

      return (
        <div>
          <div>MyComponent</div>
          <div>{getDisplayString(medplum.getProfile() as ProfileResource)}</div>
          <div>Context: {Boolean(context).toString()}</div>
          <div>Navigate: {Boolean(navigate).toString()}</div>
          <div>Profile: {Boolean(profile).toString()}</div>
        </div>
      );
    }

    render(
      <MedplumProvider medplum={new MockClient()}>
        <MyComponent />
      </MedplumProvider>
    );

    expect(screen.getByText('MyComponent')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Context: true')).toBeInTheDocument();
    expect(screen.getByText('Navigate: true')).toBeInTheDocument();
    expect(screen.getByText('Profile: true')).toBeInTheDocument();
  });

  test('Sets loading to false until medplum.initialized is set', async () => {
    function MyComponent(): JSX.Element {
      const { loading } = useMedplumContext();
      return loading ? <div>Loading...</div> : <div>Loaded!</div>;
    }

    let storage: MockAsyncClientStorage;
    let medplum: MedplumClient;

    act(() => {
      storage = new MockAsyncClientStorage();
      medplum = new MedplumClient({ fetch: () => Promise.resolve(), storage });
      render(
        <MedplumProvider medplum={medplum}>
          <MyComponent />
        </MedplumProvider>
      );
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    act(() => {
      storage.setInitialized();
    });
    expect(await screen.findByText('Loaded!')).toBeInTheDocument();
  });
});
