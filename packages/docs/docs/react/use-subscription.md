---
sidebar_position: 3
tags:
  - subscription
---

# `useSubscription` Hook

`useSubscription` creates an in-memory `Subscription` resource on the Medplum server with the given criteria and calls the
given callback when an event notification is triggered.

Subscriptions created with this hook are lightweight, share a single WebSocket connection per instance of `MedplumClient`, and are automatically
untracked and cleaned up when the containing component is no longer mounted.

## Use Cases

The `useSubscription` hook is a powerful tool for creating applications that require the client to wait for events asynchronously from the server.

Some examples include:

- Live chat
- Notification badges for tasks
- Realtime analytics dashboards

The hook makes it extremely simple to listen for resource interactions that satisfy a specified criteria and act
on them reactively, rather than having to poll via expensive search requests on a timer.

## Usage

The `useSubscription` hook takes a [FHIR search criteria](../search/basic-search.mdx) and a callback function to call when a resource interaction
that satisfies the Subscription occurs.

```tsx
function MyComponent(): JSX.Element {
  const [notificationCount, setNotificationCount] = useState(0);

  useSubscription('Communication?sender=Practitioner/abc-123&recipient=Practitioner/me-456', (bundle: Bundle) => {
    console.log('Received a message from Practitioner/abc-123!');
    handleNotificationBundle(bundle); // Do something with the bundle
    setNotificationCount((s) => s + 1);
  });

  return <div>Notifications received: {notificationCount}</div>;
}
```

### Parsing the Subscription `Bundle`

The callback receives a `Bundle` which contains a `SubscriptionStatus` as its first entry (`bundle.entry[0].resource`)
and the resource for which the `Subscription` fired for in its second entry (`bundle.entry[1].resource`):

```js
{
  "id": "90154e8b-e283-4973-a562-1b0e08611260",
  "resourceType": "Bundle",
  "type": "history",
  "timestamp": "2024-10-29T23:52:53.282Z",
  "entry": [
    // The `SubscriptionStatus` resource, which tells us which `Subscription` this event notification is for
    {
      "resource": {
        "id": "d5c532d0-cc4c-4c5b-8212-e22dcea22c73",
        "resourceType": "SubscriptionStatus",
        "status": "active",
        "type": "event-notification",
        "subscription": {
          "reference": "Subscription/90ab8fc7-d8cf-447b-9451-9259846f71e4" // Here is the Subscription reference
        },
        "notificationEvent": [
          {
            "eventNumber": "0",
            "timestamp": "2024-10-29T23:52:53.282Z",
            "focus": {
              "reference": "Communication/54d902bb-a8e6-4f60-a671-64591169aa5b" // Here is a reference to the resource below
            }
          }
        ]
      }
    },
    // The actual `Communication` resource this event fired for
    {
      "resource": {
        "resourceType": "Communication",
        "status": "in-progress",
        "payload": [{ "contentString": "Hello, Medplum!" }],
        "sent": "2024-10-29T23:52:53.240Z",
        "id": "54d902bb-a8e6-4f60-a671-64591169aa5b"
      },
      "fullUrl": "https://api.medplum.com/fhir/R4/Communication/54d902bb-a8e6-4f60-a671-64591169aa5b"
    }
  ]
}
```

So you can parse the status and the resource from the `Bundle` like this:

```tsx
function handleNotificationBundle(bundle: Bundle): void {
  // The first entry is the status, which contains a reference to the `Subscription` this notification is for
  const status = bundle.entry?.[0]?.resource as SubscriptionStatus;
  console.log('Received subscription status: ', status);

  // The second entry is the actual resource
  const communication = bundle.entry?.[1]?.resource as Communication;
  console.log('Received communication: ', communication);
}
```

### Dynamic Criteria

Changing the criteria string will automatically decrease the reference count for the current `Subscription` resource and create a new `Subscription`
with the new criteria.

```tsx
function MyComponent(): JSX.Element {
  const profile = useMedplumProfile();
  const [notificationCount, setNotificationCount] = useState(0);

  // We can track the communications for the current user only
  const profileStr = useMemo<string>(() => getReferenceString(profile), [profile]);

  useSubscription(`Communication?sender=Practitioner/abc-123&recipient=${profileStr}`, (bundle: Bundle) => {
    console.log('Received a message from Practitioner/abc-123!');
    handleNotificationBundle(bundle); // Do something with the bundle
    setNotificationCount((s) => s + 1);
  });

  return <div>Notifications received: {notificationCount}</div>;
}
```

### Temporarily Unsubscribing

In the case of wanting to temporarily unsubscribe from the current criteria until some condition has been met (for example, waiting for a search to return or a profile to refresh),
you can pass an empty string as the criteria string and the previous `Subscription` will be cleaned up without creating a new `Subscription`
until the criteria string has been changed again.

```tsx
function MyComponent(): JSX.Element {
  const profile = useMedplumProfile();
  const [notificationCount, setNotificationCount] = useState(0);

  // We can track the communications for the current user only
  const profileStr = useMemo<string>(() => (profile ? getReferenceString(profile) : ''), [profile]);

  useSubscription(
    // When profileStr is `undefined` we can pass an empty string to temporarily unsubscribe from any criteria
    profileStr ? `Communication?sender=Practitioner/abc-123&recipient=${profileStr}` : '',
    (bundle: Bundle) => {
      console.log('Received a message from Practitioner/abc-123!');
      handleNotificationBundle(bundle); // Do something with the bundle
      setNotificationCount((s) => s + 1);
    }
  );

  return <div>Notifications received: {notificationCount}</div>;
}
```

### Usage within an `Expo` app

Usage within `Expo` / `React Native` has some special considerations. See: [@medplum/expo-polyfills README](https://github.com/medplum/medplum-expo-polyfills)

### Examples

- [`BaseChat` component from `@medplum/react`](https://github.com/medplum/medplum/blob/9e836dc42cde80b533d9a3fd2254aaa5c8444136/packages/react/src/chat/BaseChat/BaseChat.tsx#L122)
- [`NotificationWidget` from `medplum-react-native-example`](https://github.com/medplum/medplum-react-native-example/blob/main/src/Home.tsx#L143)

## Subscription Extensions

Any [Subscription extension](../subscriptions/subscription-extensions.md) supported by Medplum can be attached to a `Subscription`
created by the `useSubscription` hook via a 3rd optional parameter to the hook, `options`, which takes an optional `subscriptionProps`.

```tsx
type UseSubscriptionOptions = {
  subscriptionProps?: Partial<Subscription>;
};
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
  },
};

function MyComponent(): JSX.Element {
  const [createCount, setCreateCount] = useState(0);

  useSubscription(
    'Communication?sender=Practitioner/abc-123&recipient=Practitioner/me-456',
    (_bundle) => {
      console.log('Received a new message from Practitioner/abc-123!');
      setCreateCount((s) => s + 1);
    },
    createOnlyOptions
  );

  return <div>Create notifications received: {createCount}</div>;
}
```

Subscriptions with the same criteria are tracked separately if they have differing `subscriptionProps`. This means you can create one `Subscription`
to listen for `create` interactions and another for `update` interactions and they will not interfere with each other.

```tsx
const createOnlyOptions = {
  subscriptionProps: {
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
        valueCode: 'create',
      },
    ],
  },
};

const updateOnlyOptions = {
  subscriptionProps: {
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
        valueCode: 'update',
      },
    ],
  },
};

function MyComponent(): JSX.Element {
  const [createCount, setCreateCount] = useState(0);
  const [updateCount, setUpdateCount] = useState(0);

  useSubscription(
    'Communication?sender=Practitioner/abc-123&recipient=Practitioner/me-456',
    (_bundle) => {
      console.log('Received a new message from Practitioner/abc-123!');
      setCreateCount((s) => s + 1);
    },
    createOnlyOptions
  );

  useSubscription(
    'Communication?sender=Practitioner/abc-123&recipient=Practitioner/me-456',
    (_bundle) => {
      console.log('Received an update to message from Practitioner/abc-123!');
      setUpdateCount((s) => s + 1);
    },
    updateOnlyOptions
  );

  return (
    <>
      <div>Create notifications received: {createCount}</div>
      <div>Update notifications received: {updateCount}</div>
    </>
  );
}
```

## Troubleshooting

### `Error: WebSocket subscriptions not enabled for current project`

Currently the WebSocket `Subscription` feature which is required to use the `useSubscription` hook is behind a feature flag.
Locally, you can enable this feature flag by logging in as a [super admin](../self-hosting/super-admin-guide.md)
and enabling the `websocket-subscriptions` feature on your `Project` resource from `@medplum/app`.

To get this feature enabled for your project on hosted Medplum (`app.medplum.com`), send an email to hello@medplum.com.
