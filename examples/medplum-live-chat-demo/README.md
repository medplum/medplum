<h1 align="center">Medplum Live Chat Demo</h1>
<p align="center">An example for a live patient-provider chat using Medplum's WebSocket subscriptions.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-live-chat-demo/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

This example app demonstrates the following:

- Creating WebSocket `Subscription` resource and connecting and listening to events
- Loading chat history from FHIR server on initial load
- Sending chat messages by creating new `Communication` resources
- Marking a message as received or read by updating received `Communication` resources from other chat participant
- Parsing `Communication` resources and displaying message contents as well as read receipts, message timestamps, etc.

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum-live-chat-demo/fork) and clone the repo.

Next, install the dependencies

```bash
npm install
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3000/`


> [!NOTE]
> Because `WebSocket Subscriptions` are currently experimental, the `websocket-subscriptions` feature flag needs to be enabled on your `Project` resource for this demo to work.
>
> To do this on a local dev server, login to `@medplum/app` as the `Super Admin` user and edit your `Project` resource.
> Note that a `Project Admin` cannot edit `Project.features` and it must be done by a `Super Admin`.
>
> Please [contact Medplum](mailto:hello@medplum.com) if you would like to enable this on your project on the `Medplum` hosted instance.

### About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting, and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://docs.medplum.com/storybook/index.html?)
- Join our [Discord](https://discord.gg/medplum)
