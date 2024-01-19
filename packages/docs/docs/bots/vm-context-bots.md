# VM Context Bots

To set up the Medplum Bot framework locally, Medplum offers VM Context Bots. VM Context allows bots to spin up a local thread inside your server, rather than using an isolated lambda.

There are two steps to set up VM context bots:

1. Enable VM Context Bots on your server config.
2. Set your Bot's runtime version to VM Context.

To enable VM Context bots on your server, set `vmContextBotsEnabled: true` in both the AWS parameter store _and_ your local `config.json` file.

All Bots have a field for `runtimeVersion`, which can be set to either `awslambda` or `vmcontext`. To use your bot locally, set this field to `vmcontext`.

:::danger

VM Context Bots should ONLY BE USED IN TRUSTED ENVIRONMENTS (e.g. localhost). The code for these bots runs in the server so can potentially have access to sensitive information.

:::
