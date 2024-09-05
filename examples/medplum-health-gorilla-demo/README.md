# Medplum Health Gorilla client example app

## Getting started

By default, this app is configured to use the production Medplum server. You can change the `baseUrl` and other `MepdlumClient` configuration options in `src/main.tsx`.

Before continuing, you must obtain a tarball of the Medplum Health Gorilla client package, e.g. `medplum-ee-hg-client-0.0.2.tgz` and place it in the root of this repository, i.e. alongside this `README.md` and `package.json`.

```
# ensure the Medplum Health Gorilla client package is present, e.g. medplum-ee-hg-client-0.0.2.tgz

npm i
npm run dev
```

Running these commands installs the app's dependencies and starts a `vite` development web server on [http://localhost:3000](http://localhost:3000). Visiting the site should greet you with a Medplum login page.

## Health Gorilla integration

To successfully use the example app, the Medplum Health Gorilla integration must first be setup on your Medplum project. Your point of contact at Medplum can assist you with this.
