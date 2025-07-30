# Medplum Health Gorilla client example app

## Health Gorilla integration

To successfully use this demo app, the Medplum Health Gorilla integration must first be installed into your Medplum project. Inquire with your point of contact at Medplum about adding this functionality to your contract.

## Getting started

By default, this app is configured to use the production Medplum server. If you want to change any environment variables from the defaults, copy the `.env.defaults` file to `.env`

```bash
cp .env.defaults .env
```

And make the changes you need.

Next, install the dependencies.

```bash
npm i
```

Then, run the app

```bash
npm run dev
```

Running these commands installs the app's dependencies and starts a `vite` development web server on [http://localhost:3000](http://localhost:3000). Visiting the site should greet you with a Medplum login page.
