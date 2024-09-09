# Medplum Health Gorilla client example app

## Getting started

By default, this app is configured to use the production Medplum server. You can change the `baseUrl` and other `MepdlumClient` configuration options in `src/main.tsx`.

```
npm i
npm run dev
```

Running these commands installs the app's dependencies and starts a `vite` development web server on [http://localhost:3000](http://localhost:3000). Visiting the site should greet you with a Medplum login page.

## Health Gorilla integration

To successfully use the example app, the Medplum Health Gorilla integration must first be setup on your Medplum project. Your point of contact at Medplum can assist you with this.
