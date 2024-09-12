# Medplum Health Gorilla client example app

## Health Gorilla integration

To successfully use this demo app, the Medplum Health Gorilla integration must first be installed into your Medplum project. Inquire with your point of contact at Medplum about adding this functionality to your contract.

## Getting started

By default, this app is configured to use the production Medplum server. You can change the `baseUrl` and other `MepdlumClient` configuration options in `src/main.tsx`.

```
npm i
npm run dev
```

Running these commands installs the app's dependencies and starts a `vite` development web server on [http://localhost:3000](http://localhost:3000). Visiting the site should greet you with a Medplum login page.
