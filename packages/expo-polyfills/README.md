# @medplum/expo-polyfills

A module for polyfilling the minimum necessary web APIs for using the Medplum client on React Native

## Installation in managed Expo projects

For [managed](https://docs.expo.dev/archive/managed-vs-bare/) Expo projects, please follow the installation instructions in the [API documentation for the latest stable release](#api-documentation). If you follow the link and there is no documentation available then this library is not yet usable within managed projects &mdash; it is likely to be included in an upcoming Expo SDK release.

### Expo SDK Compatibility

**It's recommended you use the latest Expo SDK (SDK 51 as of May 2024).**

However, this package should be compatible with Expo SDK `49+`. 

Going forward, each version of this package will advertise the minimum compatible Expo SDK required which is subject to change based on the breaking changes of underlying Expo packages.

## Installation in bare React Native projects

For bare React Native projects, you must ensure that you have [installed and configured the `expo` package](https://docs.expo.dev/bare/installing-expo-modules/) before continuing.

### Add the package to your npm dependencies

```
npm install @medplum/expo-polyfills
```

## Overview

There are currently two major components to this package:
1. The polyfills for getting `MedplumClient` working without errors in `React Native`. See: [`polyfillMedplumWebAPIs`]
2. The `ExpoClientStorage` class, which enables `MedplumClient` to persist what is normally stored in `LocalStorage` on the web client into a secure storage on a mobile device. Under the hood it uses [Expo's `SecureStore`](https://docs.expo.dev/versions/latest/sdk/securestore/), but abstracts away the complexity of its asynchronous APIs, since the `Storage` interface is normally synchronous in nature.

## Usage

To get full compatibility with the `MedplumClient` in React Native, call the `polyfillMedplumWebAPIs` in the app root and pass in an `ExpoClientStorage` into your `MedplumClient`.
If you want to wait to load components until after the `MedplumClient` has initialized, you can conditionally render based on the `loading` property from the `useMedplumContext` hook.

```tsx
import { MedplumClient } from '@medplum/core';
import { MedplumProvider, useMedplumContext } from '@medplum/react-hooks';
import { polyfillMedplumWebAPIs, ExpoClientStorage } from '@medplum/expo-polyfills';

polyfillMedplumWebAPIs();

const medplum = new MedplumClient({ storage: new ExpoClientStorage() });

function Home(): JSX.Element {
  const { loading } = useMedplumContext();
  return loading ? <div>Loading...</div> : <div>Loaded!</div>;
}

function App(): JSX.Element {
  return (
    <MedplumProvider medplum={medplum}>
      <Home />
    </MedplumProvider>
  );
}
```

### Usage with `Expo Router`
When using `MedplumClient` with `Expo Router`, you will likely need to disable the polyfill for `window.location`; `Expo Router` provides a polyfill that better interoperates with the package than the Medplum-provided one. See: https://expo.github.io/router/docs/lab/runtime-location#native

To disable the Medplum `window.location` polyfill, simply pass the following config to `polyfillMedplumWebAPIs`:

```ts
polyfillMedplumWebAPIs({ location: false });
```

### Usage with the Medplum `useSubscription` hook

When using `useSubscription` in your Expo app, there is one more function you should call in the root of your app: `initWebSocketManager`.
The function just takes the `MedplumClient` instance you will be using. You can get `useSubscription` working in your Expo app like so:

```tsx
import { MedplumClient, useSubscription } from '@medplum/core';
import { MedplumProvider, useMedplumContext } from '@medplum/react-hooks';
import { polyfillMedplumWebAPIs, ExpoClientStorage, initWebSocketManager } from '@medplum/expo-polyfills';

polyfillMedplumWebAPIs();

const medplum = new MedplumClient({ storage: new ExpoClientStorage() });

initWebSocketManager(medplum);

function Counter(): JSX.Element {
  const [count, setCount] = useState(0);

  useSubscription(
    'Communication',
    (_bundle: Bundle) => {
      setCount((s) => s + 1);
    }
  );

  return <div>Count: {count}</div>
}

function Home(): JSX.Element {
  const { loading } = useMedplumContext();
  return loading ? <div>Loading...</div> : <Counter />;
}

function App(): JSX.Element {
  return (
    <MedplumProvider medplum={medplum}>
      <Home />
    </MedplumProvider>
  );
}
```

### Managing backgrounding of app when using `useSubscription`

Due to stability concerns on both the mobile app and Medplum server, we automatically close the WebSocket connection when the mobile app is backgrounded / goes inactive. However, we will automatically seamlessly reconnect the WebSocket when the app becomes active again. This means that you may miss notifications for a subscription in between disconnecting and reconnecting. We try to make it more ergonomic for managing the "catch-up" process for developers by providing lifecycle "hooks" (not React hooks, but options in the `useSubscription` hook itself). We have the following lifecycle events that you can use to make sure you don't miss an event for a resource:

- `onWebSocketOpen` - When the WebSocket itself makes a successful connection.
- `onWebSocketOpen` - When the WebSocket itself closes.
- `onSubscriptionConnect` - When a particular subscription has been established and we are sure that we are receiving notification events for it.
- `onSubscriptionDisconnect` - When a particular subscription is disconnected and we are no longer getting notification events for it.

Here is how you can use these lifecycle callbacks to notify the user that the connection has been lost and find any messages that have been missed after it reconnects to this particular subscription:

```tsx
import { MedplumClient } from '@medplum/core';
import { MedplumProvider, useMedplumContext, useMedplum, useSubscription } from '@medplum/react-hooks';
import { polyfillMedplumWebAPIs, ExpoClientStorage, initWebSocketManager } from '@medplum/expo-polyfills';

polyfillMedplumWebAPIs();

const medplum = new MedplumClient({ storage: new ExpoClientStorage() });

initWebSocketManager(medplum);

function Counter(): JSX.Element {
  const medplum = useMedplum();
  const [count, setCount] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const lastMessageTime = useRef<string>(new Date().toISOString());

  useSubscription(
    'Communication',
    (_bundle: Bundle) => {
      setCount((s) => s + 1);
      lastMessageTime.current = new Date().toISOString();
    },
    {
      onWebSocketClose: useCallback(() => {
        if (!reconnecting) {
          setReconnecting(true);
        }
        showNotification({ color: 'red', message: 'Live chat disconnected. Attempting to reconnect...' });
      }, [setReconnecting, reconnecting]),
      onWebSocketOpen: useCallback(() => {
        if (reconnecting) {
          showNotification({ color: 'green', message: 'Live chat reconnected.' });
        }
      }, [reconnecting]),
      onSubscriptionConnect: useCallback(() => {
        if (reconnecting) {
          const searchParams = new URLSearchParams();
          searchParams.append('_sort', '-_lastUpdated');
          // Get messages that are greater than the last received timestamp
          if (lastMessageTime.current) {
            searchParams.append('_lastUpdated', `gt${lastMessageTime.current}`);
          }
          lastMessageTime.current = new Date().toISOString();
          medplum.searchResources('Communication', searchParams, { cache: 'no-cache' })
            .then((communications: Communication[]) => {
              setCount(s => s + communications.length);
            })
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
          setReconnecting(false);
        }
      }, [reconnecting, setReconnecting, medplum]),
    }
  );

  return <div>Count: {count}</div>
}

function Home(): JSX.Element {
  const { loading } = useMedplumContext();
  return loading ? <div>Loading...</div> : <Counter />;
}

function App(): JSX.Element {
  return (
    <MedplumProvider medplum={medplum}>
      <Home />
    </MedplumProvider>
  );
}
```
