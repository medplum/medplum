<h1 align="center">Medplum WebSocket Subscription Demo</h1>
<p align="center">An example demonstrating basic usage of WebSocket subscriptions</p>
<p align="center">
<a href="https://github.com/medplum/medplum-websocket-subscriptions-demo/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

This example app demonstrates the following:

- Creating WebSocket `Subscription` resources
- Calling `$get-ws-binding-token` operation on created `Subscription`s in order to get a token to bind to
- Connecting to the WebSocket subscription endpoint
- Creating a `bind-with-token` message to start receiving subscription notifications for `Subscription`s associated with the provided token
- Disconnecting from the endpoint
- Cleaning up `Subscription`s after finishing the session

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum-websocket-subscriptions-demo/fork) and clone the repo.

Next, install the dependencies

```bash
npm install
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3000/`

### About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting, and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://docs.medplum.com/storybook/index.html?)
- Join our [Discord](https://discord.gg/medplum)
