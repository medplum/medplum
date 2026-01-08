---
sidebar_position: 10
---

# Run as User

By default, the AccessPolicy that is applied to a Medplum Bot is defined by the Bot's [ProjectMembership](/docs/api/fhir/medplum/projectmembership). This can be useful for many cases where the Bot should have different access to resources than the user who triggered the Bot.

However, there are cases where you may want the __Bot to inherit the access of the user who triggered it__. To do this, you can set the `runAsUser` field on the [Bot](/docs/api/fhir/medplum/bot) to true.

Example:

```typescript
const Bot = await medplum.createResource({
  resourceType: 'Bot',
  name: 'My Bot',
  runAsUser: true,
});
```

Then, when you execute the Bot, it will inherit the access of the User who triggered it instead of the Bot. For example, if [client credentials auth](/docs/auth/client-credentials) are used to generate the access token that is used to execute the Bot, then the Bot's access will be defined by the AccessPolicy on the ProjectMembership for that Client Application that was used to trigger the Bot.


