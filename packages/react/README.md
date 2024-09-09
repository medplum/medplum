# Medplum React Component Library

The Medplum React Component Library provides many helpful components to quickly build your healthcare web app.

The Medplum SDK can be used with any compliant FHIR server. However, some advanced features are only available when paired with a Medplum server.

Check out a live demo: <https://storybook.medplum.com/>

## Installation

Add as a dependency:

```
npm install @medplum/react
```

Note the following peer dependencies:

- [@medplum/core](https://www.npmjs.com/package/@medplum/core)
- [react](https://www.npmjs.com/package/react)
- [react-dom](https://www.npmjs.com/package/react-dom)
- [react-router-dom](https://www.npmjs.com/package/react-router-dom)

Note the following optional peer dependencies:

- [@emotion/react](https://www.npmjs.com/package/@emotion/react)
- [@mantine/core](https://www.npmjs.com/package/@mantine/core)
- [@mantine/hooks](https://www.npmjs.com/package/@mantine/hooks)
- [@mantine/notifications](https://www.npmjs.com/package/@mantine/notifications)

## Basic Usage

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

## Sign In

```tsx
export function SignInPage() {
  const auth = useMedplumContext();
  return (
    <Document>
      {auth.user ? (
        <div>
          <pre>User: {JSON.stringify(auth.user)}</pre>
          <Button onClick={() => auth.medplum.signOut().then(() => alert('Signed out!'))}>Sign out</Button>
        </div>
      ) : (
        <SignInForm onSuccess={() => alert('Signed in!')} />
      )}
    </Document>
  );
}
```

## Chat

```tsx
export function ChatPage() {
  return (
    <Document>
      <ChatControl criteria="Communication?encounter=123" {...args} />
    </Document>
  );
}
```

## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

Apache 2.0. Copyright &copy; Medplum 2024
