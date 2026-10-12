// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClientEventMap, ProfileResource } from '@medplum/core';
import { ClientStorage, MemoryStorage, MockAsyncClientStorage, getDisplayString, sleep } from '@medplum/core';
import { FhirRouter, MemoryRepository } from '@medplum/fhir-router';
import { MockClient, MockFetchClient, createFakeJwt } from '@medplum/mock';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { MockInstance } from 'vitest';
import { MedplumProvider } from './MedplumProvider';
import type { MedplumErrorDetails } from './MedplumProvider.context';
import {
  useMedplum,
  useMedplumContext,
  useMedplumErrorHandler,
  useMedplumNavigate,
  useMedplumProfile,
} from './MedplumProvider.context';

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

  describe('Loading is always in sync with MedplumClient#isLoading()', () => {
    function MyComponent(): JSX.Element {
      const { loading } = useMedplumContext();
      return loading ? <div>Loading...</div> : <div>Loaded!</div>;
    }

    test('No active login & AsyncClientStorage', async () => {
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
        await sleep(250);
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      // Finally set storage to initialized
      act(() => {
        storage.setInitialized();
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
    });

    test('Active login & AsyncClientStorage', async () => {
      let storage: MockAsyncClientStorage;
      let medplum!: MockClient;

      act(() => {
        storage = new MockAsyncClientStorage();
        storage.setObject('activeLogin', {
          // This access token contains a field `login_id` which is necessary to pass the validation required in `isMedplumAccessToken`
          // to get into the state of `MedplumClient.medplumServer === true`
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0',
          refreshToken: '456',
          profile: {
            reference: 'Practitioner/124',
          },
          project: {
            reference: 'Project/123',
          },
        });
        medplum = new MockClient({
          storage,
        });
      });

      const getSpy = vi.spyOn(medplum, 'get');

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
        await sleep(250);
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      // Finally set storage to initialized
      act(() => {
        storage.setInitialized();
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      // Sleep to make sure that we can resolve stuff
      await act(async () => {
        await sleep(0);
      });

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(getSpy).toHaveBeenCalledWith('auth/me', expect.any(Object));

      getSpy.mockRestore();
    });

    test('No active login & NO AsyncClientStorage', async () => {
      const baseUrl = 'https://example.com/';
      let medplum!: MockClient;
      const router = new FhirRouter();
      const repo = new MemoryRepository();
      const client = new MockFetchClient(router, repo, baseUrl);
      const mockFetchSpy = vi.spyOn(client, 'mockFetch');

      act(() => {
        medplum = new MockClient();
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

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(mockFetchSpy).not.toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
    });

    test('Active login & NO AsyncClientStorage', async () => {
      const baseUrl = 'https://example.com/';
      const storage = new ClientStorage(new MemoryStorage());
      storage.setObject('activeLogin', {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0',
        refreshToken: '456',
        profile: {
          reference: 'Practitioner/124',
        },
        project: {
          reference: 'Project/123',
        },
      });

      let medplum!: MockClient;
      const router = new FhirRouter();
      const repo = new MemoryRepository();
      const client = new MockFetchClient(router, repo, baseUrl);
      const mockFetchSpy = vi.spyOn(client, 'mockFetch');

      act(() => {
        medplum = new MockClient({
          storage,
          mockFetchOverride: { router, repo, client },
        });
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

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(mockFetchSpy).toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));

      mockFetchSpy.mockRestore();
    });

    test('Refreshing profile re-triggers loading when no profile present', async () => {
      const baseUrl = 'https://example.com/';
      const storage = new ClientStorage(new MemoryStorage());
      storage.setObject('activeLogin', {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0',
        refreshToken: '456',
        profile: {
          reference: 'Practitioner/124',
        },
        project: {
          reference: 'Project/123',
        },
      });

      let medplum!: MockClient;
      const router = new FhirRouter();
      const repo = new MemoryRepository();
      const client = new MockFetchClient(router, repo, baseUrl);
      const mockFetchSpy = vi.spyOn(client, 'mockFetch');
      let dispatchEventSpy!: MockInstance;

      act(() => {
        medplum = new MockClient({
          storage,
          mockFetchOverride: { router, repo, client },
        });
        dispatchEventSpy = vi.spyOn(medplum, 'dispatchEvent');
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

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(mockFetchSpy).toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshed' });

      mockFetchSpy.mockClear();
      dispatchEventSpy.mockClear();

      let loginPromise!: Promise<void>;

      act(() => {
        // We clear the active login so that we can test what happens when we call `getProfileAsync()`
        // Which we want to call `refreshProfile()`
        // Which is only possible if `sessionDetails` is not defined
        medplum.clearActiveLogin();
        medplum.setAccessToken(
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0'
        );
        // This is what is testing that we go back to a loading state when profile is being refreshed
        loginPromise = medplum.setActiveLogin({
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0',
          refreshToken: '456',
          profile: {
            reference: 'Practitioner/124',
          },
          project: {
            reference: 'Project/123',
          },
        });
      });

      expect(medplum.isLoading()).toEqual(true);
      expect(await screen.findByText('Loading...')).toBeInTheDocument();
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshing' });

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshed' });

      await loginPromise;

      expect(mockFetchSpy).toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
    });

    test('Refreshing profile when profile present does not unmount children guarded by `.isLoading()`', async () => {
      function RenderCounter({ parentRenderCount }: { parentRenderCount: number }): JSX.Element {
        const [childCount, setChildCount] = useState(0);

        useEffect(() => {
          setChildCount((prevCount) => prevCount + 1);
        }, [parentRenderCount]);

        return (
          <div>
            <div>Parent count: {parentRenderCount}</div>
            <div>Child count: {childCount}</div>
          </div>
        );
      }

      function MyComponent(): JSX.Element {
        const renderCountRef = useRef(0);
        renderCountRef.current += 1;

        const { loading } = useMedplumContext();
        if (loading) {
          return <div>Loading...</div>;
        }

        return <RenderCounter parentRenderCount={renderCountRef.current} />;
      }

      const baseUrl = 'https://example.com/';
      const storage = new ClientStorage(new MemoryStorage());
      storage.setObject('activeLogin', {
        accessToken: createFakeJwt({
          sub: '1234567890',
          iat: Math.ceil(Date.now() / 1000),
          exp: Math.ceil(Date.now() / 1000) + 60 * 60,
          client_id: '123',
          login_id: '123',
        }),
        refreshToken: createFakeJwt({ client_id: '123' }),
        profile: {
          reference: 'Practitioner/124',
        },
        project: {
          reference: 'Project/123',
        },
      });

      let medplum!: MockClient;
      const router = new FhirRouter();
      const repo = new MemoryRepository();
      const client = new MockFetchClient(router, repo, baseUrl);
      const mockFetchSpy = vi.spyOn(client, 'mockFetch');
      let dispatchEventSpy!: MockInstance;

      act(() => {
        medplum = new MockClient({
          storage,
          mockFetchOverride: { router, repo, client },
        });
        dispatchEventSpy = vi.spyOn(medplum, 'dispatchEvent');
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

      expect(await screen.findByText('Parent count: 2')).toBeInTheDocument();
      expect(await screen.findByText('Child count: 1')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(mockFetchSpy).toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshed' });

      mockFetchSpy.mockClear();
      dispatchEventSpy.mockClear();

      const refreshingPromise = new Promise((resolve) => {
        medplum.addEventListener('profileRefreshing', resolve);
      });

      act(() => {
        medplum.refreshIfExpired(1000 * 60 * 60 * 2 /* 2 hours in ms */).catch(console.error);
      });

      const refreshedPromise = new Promise((resolve) => {
        medplum.addEventListener('profileRefreshing', resolve);
      });

      await act(async () => {
        await refreshingPromise;
        expect(medplum.isLoading()).toEqual(false);
        await refreshedPromise;
      });

      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshing' });
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshed' });
      expect(medplum.isLoading()).toEqual(false);
      expect(screen.getByText('Parent count: 4')).toBeInTheDocument();
      expect(screen.getByText('Child count: 3')).toBeInTheDocument();

      expect(mockFetchSpy).toHaveBeenLastCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
    });

    test('Async ClientStorage.getInitPromise throws', async () => {
      const originalConsoleError = console.error;
      console.error = vi.fn();

      class TestAsyncStorage extends MockAsyncClientStorage {
        private promise: Promise<void>;
        private reject!: (err: Error) => void;
        constructor() {
          super();
          this.promise = new Promise((_resolve, reject) => {
            this.reject = reject;
          });
        }

        getInitPromise(): Promise<void> {
          return this.promise;
        }

        rejectInitPromise(): void {
          this.reject(new Error('Failed to init storage!'));
        }
      }

      const storage = new TestAsyncStorage();
      let medplum!: MockClient;
      let dispatchEventSpy!: MockInstance;

      act(() => {
        medplum = new MockClient({
          storage,
        });
        dispatchEventSpy = vi.spyOn(medplum, 'dispatchEvent');
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

      act(() => {
        storage.rejectInitPromise();
      });

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(dispatchEventSpy).toHaveBeenCalledWith<[MedplumClientEventMap['storageInitFailed']]>({
        type: 'storageInitFailed',
        payload: { error: new Error('Failed to init storage!') },
      });
      expect(dispatchEventSpy).not.toHaveBeenCalledWith<[MedplumClientEventMap['storageInitialized']]>({
        type: 'storageInitialized',
      });

      expect(console.error).toHaveBeenCalledWith(new Error('Failed to init storage!'));
      console.error = originalConsoleError;
    });
  });

  describe('onError', () => {
    function Reporter({ error, details }: { error: Error; details?: MedplumErrorDetails }): JSX.Element {
      const onError = useMedplumErrorHandler();
      useEffect(() => {
        onError(error, details);
      }, [onError, error, details]);
      return <div>Reporter</div>;
    }

    test('Reports to the provided handler, which can change without re-running effects', () => {
      const medplum = new MockClient();
      const details = { source: 'Reporter' };
      const firstError = new Error('First');
      const firstHandler = vi.fn();

      const { rerender } = render(
        <MedplumProvider medplum={medplum} onError={firstHandler}>
          <Reporter error={firstError} details={details} />
        </MedplumProvider>
      );
      expect(firstHandler).toHaveBeenCalledExactlyOnceWith(firstError, details);

      // A new handler identity does not invalidate effects that depend on the error handler
      const secondHandler = vi.fn();
      rerender(
        <MedplumProvider medplum={medplum} onError={secondHandler}>
          <Reporter error={firstError} details={details} />
        </MedplumProvider>
      );
      expect(firstHandler).toHaveBeenCalledTimes(1);
      expect(secondHandler).not.toHaveBeenCalled();

      // ...but later reports reach the new handler
      const secondError = new Error('Second');
      rerender(
        <MedplumProvider medplum={medplum} onError={secondHandler}>
          <Reporter error={secondError} details={details} />
        </MedplumProvider>
      );
      expect(firstHandler).toHaveBeenCalledTimes(1);
      expect(secondHandler).toHaveBeenCalledExactlyOnceWith(secondError, details);
    });

    test('Defaults to console.error', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const withDetails = new Error('With details');
      const withoutDetails = new Error('Without details');
      const withoutProvider = new Error('Without provider');

      render(
        <MedplumProvider medplum={new MockClient()}>
          <Reporter error={withDetails} details={{ source: 'Reporter', message: 'Loading things' }} />
          <Reporter error={withoutDetails} />
        </MedplumProvider>
      );
      render(<Reporter error={withoutProvider} />);

      expect(consoleErrorSpy).toHaveBeenCalledWith(withDetails, { source: 'Reporter', message: 'Loading things' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(withoutDetails);
      expect(consoleErrorSpy).toHaveBeenCalledWith(withoutProvider);
      consoleErrorSpy.mockRestore();
    });

    test('Reports a navigate prop that rejects, and returns its result', async () => {
      const onError = vi.fn();
      const error = new Error('Navigation blocked');
      let returned: unknown;
      function Navigator(): JSX.Element {
        const medplumNavigate = useMedplumNavigate();
        useEffect(() => {
          returned = medplumNavigate('/Patient');
        }, [medplumNavigate]);
        return <div>Navigator</div>;
      }

      const rejecting = vi.fn().mockRejectedValue(error);
      const { unmount } = render(
        <MedplumProvider medplum={new MockClient()} navigate={rejecting} onError={onError}>
          <Navigator />
        </MedplumProvider>
      );

      expect(rejecting).toHaveBeenCalledWith('/Patient');
      // The caller still gets the navigate prop's promise, so awaiting it sees the rejection too
      await expect(returned).rejects.toBe(error);
      await waitFor(() =>
        expect(onError).toHaveBeenCalledExactlyOnceWith(error, {
          source: 'MedplumProvider',
          message: 'Navigation failed',
        })
      );
      unmount();

      // A navigate prop that returns nothing has nothing to report
      const synchronous = vi.fn();
      render(
        <MedplumProvider medplum={new MockClient()} navigate={synchronous} onError={onError}>
          <Navigator />
        </MedplumProvider>
      );
      expect(synchronous).toHaveBeenCalledWith('/Patient');
      expect(returned).toBeUndefined();
      expect(onError).toHaveBeenCalledTimes(1);
    });

    test('Falls back to the console when the handler throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const error = new Error('Original');
      const handlerError = new Error('Telemetry unavailable');
      const onError = vi.fn(() => {
        throw handlerError;
      });

      // Rendering would throw if the handler's error escaped the Reporter's effect
      render(
        <MedplumProvider medplum={new MockClient()} onError={onError}>
          <Reporter error={error} details={{ source: 'Reporter' }} />
        </MedplumProvider>
      );

      expect(onError).toHaveBeenCalledExactlyOnceWith(error, { source: 'Reporter' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(error, { source: 'Reporter' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(handlerError, {
        source: 'MedplumProvider',
        message: 'onError handler threw',
      });
      consoleErrorSpy.mockRestore();
    });
  });
});
