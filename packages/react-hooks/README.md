# Medplum React Hooks Library

The Medplum React Hooks Library provides non-UI React features for your application.

Most users will want the full Medplum React Component Library, `@medplum/react`. However, that library has peer dependencies on Mantine, which may not be desired.

## Key Features

- [`useMedplum`](#usemedplum) - handles shared global instance of `MedplumClient`
- `useResource` - reads a resource by ID or reference with intelligent caching
- `useSearch` - performs a FHIR search with intelligent state management
- [`useSubscription`](#usesubscription) - subscribes to a FHIR search criteria and calls a given callback upon receiving a relevant notification

## Installation

Add as a dependency:

```
npm install @medplum/react-hooks
```

Note the following peer dependencies:

- [@medplum/core](https://www.npmjs.com/package/@medplum/core)
- [react](https://www.npmjs.com/package/react)
- [react-dom](https://www.npmjs.com/package/react-dom)

## Setup

```tsx
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';

const medplum = new MedplumClient();

export function App() {
  return (
    <MedplumProvider medplum={medplum}>
      <MyPage1 />
      <MyPage2 />
      <Etc />
    </MedplumProvider>
  );
}
```

For more details on how to setup `MedplumClient`, refer to the docs for [`medplum`](https://www.npmjs.com/package/medplum).

## `useMedplum`

```tsx
import { useMedplum } from '@medplum/react-hooks';

export function MyComponent() {
  const medplum = useMedplum();
  return <div>{JSON.stringify(medplum.getProfile())}</div>;
}
```

## `useMedplumContext`

`useMedplumContext` can be used to access the `MedplumContext` provided by the `MedplumProvider` directly. The `MedplumContext` has the following interface:

```ts
interface MedplumContext {
  medplum: MedplumClient;
  navigate: MedplumNavigateFunction;
  profile?: ProfileResource;
  loading: boolean;
}
```

### Using `loading` to know when `MedplumClient` initialization is done
You can use the `loading` property from `useMedplumContext()` to know when `MedplumClient` has finished initialization successfully. `loading` is updated asynchronously so it will usually start as `false` and change to `true` once the client has finished its initialization.

```tsx
function MyComponent(): JSX.Element {
  const { loading } = useMedplumContext();
  return loading ? (
    <Spinner />
  ) : (
    <div>Loaded!</div>
  );
}
```

## `useSubscription`

`useSubscription` creates an in-memory `Subscription` resource with the given criteria on the Medplum server and calls the given callback when an event notification is triggered by a resource interaction over a WebSocket connection.

Subscriptions created with this hook are lightweight, share a single WebSocket connection, and are automatically untracked and cleaned up when the containing component is no longer mounted.

```tsx
function MyComponent(): JSX.Element {
  const [notificationCount, setNotificationCount] = useState(0);

  useSubscription(
    'Communication?sender=Practitioner/abc-123&recipient=Practitioner/me-456', 
    (bundle: Bundle) => {
      console.log('Received a message from Practitioner/abc-123!');
      handleNotificationBundle(bundle); // Do something with the bundle
      setNotificationCount(s => s + 1);
    }
  );

  return <div>Notifications received: {notificationCount}</div>;
}
```

### Subscription Extensions

Any [Subscription extension](https://www.medplum.com/docs/subscriptions/subscription-extensions) supported by Medplum can be attached to a `Subscription` created by the `useSubscription` hook via a 3rd optional parameter to the hook, `options`, which takes an optional `subscriptionProps`.

```tsx
type UseSubscriptionOptions = {
  subscriptionProps?: Partial<Subscription>;
}
```

Here's how you would subscribe to only `create` interactions for a criteria:

```tsx
const createOnlyOptions = {
  subscriptionProps: {
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
        valueCode: 'create',
      },
    ],
  }
};

function MyComponent(): JSX.Element {
  const [createCount, setCreateCount] = useState(0);

  useSubscription(
    'Communication?sender=Practitioner/abc-123&recipient=Practitioner/me-456',
    (_bundle) => {
      console.log('Received a new message from Practitioner/abc-123!');
      setCreateCount(s => s + 1);
    },
    createOnlyOptions,
  );

  return <div>Create notifications received: {createCount}</div>;
}
```

Subscriptions with the same criteria are tracked separately if they have differing `subscriptionProps`. This means you can create one `Subscription` to listen for `create` interactions and another for `update` interactions and they will not interfere with each other.

```tsx
const createOnlyOptions = {
  subscriptionProps: {
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
        valueCode: 'create',
      },
    ],
  }
};

const updateOnlyOptions = {
  subscriptionProps: {
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
        valueCode: 'update',
      },
    ],
  }
};

function MyComponent(): JSX.Element {
  const [createCount, setCreateCount] = useState(0);
  const [updateCount, setUpdateCount] = useState(0);

  useSubscription(
    'Communication?sender=Practitioner/abc-123&recipient=Practitioner/me-456',
    (_bundle) => {
      console.log('Received a new message from Practitioner/abc-123!');
      setCreateCount(s => s + 1);
    },
    createOnlyOptions,
  );

  useSubscription(
    'Communication?sender=Practitioner/abc-123&recipient=Practitioner/me-456',
    (_bundle) => {
      console.log('Received an update to message from Practitioner/abc-123!');
      setUpdateCount(s => s + 1);
    },
    updateOnlyOptions,
  );

  return (
    <>
      <div>Create notifications received: {createCount}</div>
      <div>Update notifications received: {updateCount}</div>
    </>
  );
}
```

## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

Apache 2.0. Copyright &copy; Medplum 2024
