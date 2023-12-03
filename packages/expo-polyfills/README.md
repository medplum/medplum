# @medplum/expo-polyfills

A module for polyfilling the minimum necessary web APIs for using the Medplum client on React Native

## Installation in managed Expo projects

For [managed](https://docs.expo.dev/archive/managed-vs-bare/) Expo projects, please follow the installation instructions in the [API documentation for the latest stable release](#api-documentation). If you follow the link and there is no documentation available then this library is not yet usable within managed projects &mdash; it is likely to be included in an upcoming Expo SDK release.

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
