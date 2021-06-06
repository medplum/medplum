# Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications.  Medplum includes a FHIR server, React component library, and developer console.

**Warning: This is Alpha code and not production ready.**

# Medplum React Component Library

The Medplum React Component Library provides many helpful components to quickly build your healthcare web app.

The Medplum SDK can be used with any compliant FHIR server.  However, some advanced features are only available when paired with a Medplum server.

Check out a live demo: [https://storybook.medplum.com/](https://storybook.medplum.com/)

## Key Features

* SmartText - Detect clinical concepts, tag with SNOMED and ICD codes
* Chat - FHIR-based chat with real time push events
* Data Table - For a FHIR search, show the results as a live table
* SSE for server side push
* Evaluation of [FhirPath](https://hl7.org/fhirpath/N1/index.html)
* No external dependencies

## Installation

Note that [`medplum`](https://www.npmjs.com/package/medplum) and [`react`](https://www.npmjs.com/package/react) are peer dependencies:

```
npm install --save-dev medplum medplum-ui react react-dom
```

## Basic Usage

```tsx
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient({
    baseUrl: 'https://www.example.com/fhir/R4/',
    clientId: 'MY_CLIENT_ID'
});

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
          <Button onClick={() => auth.medplum.signOut().then(() => alert('Signed out!'))}>
            Sign out
      </Button>
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

## License

Apache 2.0.  Copyright &copy; Medplum 2021
