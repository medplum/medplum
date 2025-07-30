# Running Bots Locally

To set up the Medplum [`Bot`](/docs/api/fhir/medplum/bot) framework locally, Medplum offers VM Context [`Bots`](/docs/api/fhir/medplum/bot). VM Context allows bots to spin up a local thread inside your server, rather than using an isolated lambda.

Before enabling VM Context [Bots](/docs/api/fhir/medplum/bot), you must first enable bots on your project. To do so, follow thse steps:

1. Log in to your [Super Admin Project](/docs/self-hosting/super-admin-guide).
2. Access your [Project](/docs/api/fhir/medplum/project) resource.
3. Go to the `Edit` tab.
4. In the `Features` section, add the `bot` feature.

:::note
The `defaultProjectFeatures` server config setting is used for default features when your project is being set up. Editing this config setting will not update your project to enable bots.
:::

Once this is done, you can enable VM Context bots. There are two steps to set up VM context bots:

1. Enable VM Context [`Bots`](/docs/api/fhir/medplum/bot) on your server config.
2. Set your [`Bot's`](/docs/api/fhir/medplum/bot) runtime version to VM Context.

To enable VM Context [`Bots`](/docs/api/fhir/medplum/bot) on your server, set `vmContextBotsEnabled: true` in both the AWS parameter store and your local `config.json` file.

All [`Bots`](/docs/api/fhir/medplum/bot) have a field for `runtimeVersion`, which can be set to either `awslambda` or `vmcontext`. To use your [`Bot`](/docs/api/fhir/medplum/bot) locally, set this field to `vmcontext`.

Using VM Context allows you to use resources more efficiently, however it can also have security and isolation concerns if used in an untrusted environment. For this reason, it is important to only use VM Context [`Bots`](/docs/api/fhir/medplum/bot) in trusted environments.

:::danger

**The `node:vm` module is not a security mechanism. Do not use it to run untrusted code.**

The code for these bots runs in the server, so they can potentially have access to sensitive information when run in production environments without appropriate safety measures.

:::
