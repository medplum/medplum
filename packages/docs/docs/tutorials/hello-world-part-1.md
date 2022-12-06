---
sidebar_position: 4
sidebar_label: Hello World App
---

# Hello World Part 1

Welcome to Part 1 of the Medplum Hello World series.

In Part 1, we will go through the basics of registering a new account and creating a minimal Medplum application.

## Register for a Medplum account

Open the Medplum register page in your browser: https://app.medplum.com/register

Fill in your account details and click "Create account"

Congrats, you now have a Medplum account!

## Create a patient

Click on the menu button in the top left corner

![Top left menu](/img/hello-world/top-left-menu.png)

Click on "Patients"

![Patients menu item](/img/hello-world/patients-menu-item.png)

Click on "New" in the toolbar

![New Patient button](/img/hello-world/new-patient-button.png)

Add a patient name

![Patient name](/img/hello-world/patient-name.png)

Scroll to the bottom and click "OK"

![OK Button](/img/hello-world/ok-button.png)

Congrats, you created a patient!

Go to the "Details" tab:

Copy the "ID" field, because we will need it later. Patients often have many identifiers: MRN (medical record number), SSN (social security number), drivers' license, etc. The primary "ID" is a special ID that we will use in the Medplum API.

## Find Client Application ID

Now let's get our Client Application ID, because we will also need that later. Click on the menu button in the top left corner:

Click on "Client Applications":

When you registered your account, Medplum automatically created a default client. Click on that row:

And copy the Client Application ID:

To recap: You registered a new account, created a patient, and should have a Patient ID and a Client Application ID.

## Create a React app

First, make sure you have Node JS and npm installed. If not, follow instructions here:

https://nodejs.org/en/download/

Open a terminal window. Create a new React app using create-react-app. We're going to use the TypeScript variant:

```bash
npx create-react-app medplum-hello-world --template typescript
cd medplum-hello-world
npm start
```

That should open a browser window to the default React app:

Go back to the terminal. Stop the Node JS process using Ctrl+C.

## Add Medplum dependencies

Next let's add Medplum dependencies.

npm install @medplum/core @medplum/react

The @medplum/core package includes the basic Medplum client and utilities.

The @medplum/react package includes the React components.

## Add Medplum authentication

Next let's use the Medplum React components. Open the medplum-hello-world folder in your favorite editor.

I will use VS Code:

First we need to connect our Medplum account. Open "src/index.tsx". Add a couple Medplum imports:

```tsx
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
```

Add the Medplum client using the Client Application ID from before. Be sure to replace `YOUR_CLIENT_ID_HERE` with the actual client ID.

```tsx
const medplum = new MedplumClient({
  clientId: 'YOUR_CLIENT_ID_HERE',
});
```

And add the MedplumProvider to the app:

```tsx
<React.StrictMode>
  <MedplumProvider medplum={medplum}>
    <App />
  </MedplumProvider>
</React.StrictMode>
```

When you're done, src/index.tsx should look like this:

```tsx
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const medplum = new MedplumClient({
  clientId: 'YOUR_CLIENT_ID_HERE',
});

ReactDOM.render(
  <React.StrictMode>
    <MedplumProvider medplum={medplum}>
      <App />
    </MedplumProvider>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
```

## Add a Medplum UI component

Let's add a patient timeline to the app. Open "src/App.tsx".

Add a few Medplum imports:

```tsx
import { PatientTimeline, SignInForm, useMedplumProfile } from '@medplum/react';
```

Replace the App function with the following. Be sure to replace `YOUR_PATIENT_ID_HERE` with the actual patient ID.

```tsx
function App() {
  const profile = useMedplumProfile();
  return profile ? (
    <div className="App">
      <PatientTimeline patient={{ reference: 'Patient/YOUR_PATIENT_ID_HERE' }} />
    </div>
  ) : (
    <SignInForm />
  );
}
```

What does that do? Let's go line by line:

```tsx
const profile = useMedplumProfile();
```

This is a React hook that gets the current user profile. If the user is logged in, it will be a Practitioner or Patient FHIR resource. If the user is not logged in, it will be null. Because it is a React hook, the React engine will automatically re-execute this function if the profile changes.

```tsx
  return profile ? (
    <div className="App">
      <PatientTimeline patient={{ reference: 'Patient/YOUR_PATIENT_ID_HERE' }} />
    </div>
  )
```

If the user is signed in, we want to render a PatientTimeline. PatientTimeline is a high level Medplum component that will show common Patient events.

```tsx
  ) : (
    <SignInForm />
  );
```

Otherwise, if the user is not signed in, we want to render the SignInForm.

## Run the app

Go back to the terminal and run:

```bash
npm start
```

First you should see the Sign-in form:

![Sign-in form](/img/hello-world/sign-in.png)

And after you sign-in, you should see the patient timeline. The timeline component includes comments and file attachments out of the box:

![Patient timeline](/img/hello-world/patient-timeline.png)

Congrats! You completed Medplum Hello World Part!
