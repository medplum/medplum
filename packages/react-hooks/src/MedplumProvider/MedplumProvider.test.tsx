import { MockAsyncClientStorage, ProfileResource, getDisplayString, sleep } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
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

  test('Loading is always in sync with isLoading()', async () => {
    function MyComponent(): JSX.Element {
      const { loading } = useMedplumContext();
      return loading ? <div>Loading...</div> : <div>Loaded!</div>;
    }

    let storage: MockAsyncClientStorage;
    let medplum!: MockClient;

    act(() => {
      storage = new MockAsyncClientStorage();
      medplum = new MockClient({ storage });
    });

    expect(medplum.isLoading()).toEqual(true);

    act(() => {
      render(
        <MedplumProvider medplum={medplum}>
          <MyComponent />
        </MedplumProvider>
      );
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(medplum.isLoading()).toEqual(true);

    // Sleep to make sure that loading doesn't go to false before we set storage to initialized
    await act(async () => {
      await sleep(500);
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(medplum.isLoading()).toEqual(true);

    // Finally set storage to initialized
    act(() => {
      storage.setInitialized();
    });

    expect(await screen.findByText('Loaded!')).toBeInTheDocument();
    expect(medplum.isLoading()).toEqual(false);

    // Make sure we are actually authed after loading === false
    expect(medplum.getProfile()).toBeDefined();
  });
});
