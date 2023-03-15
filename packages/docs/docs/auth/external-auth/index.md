# External Authentication Providers

Medplum supports enabling multiple external authentication providers in a number of pragmatic configurations. This section provides documentation on using an external authentication provider, such as **Okta, Google Authentication, Auth0 or AWS Cognito** for your Medplum project. Authentication methods can be enabled on hosted Medplum, for example https://app.medplum.com, or on a custom domain.

## Requiring Authentication via External Provider

On the Medplum app and in external applications that use Medplum auth, developers can enable external authentication providers at three levels.

1. At a **email domain level**, for example all email addresses at `customdomain.com` (e.g. `jdoe@customdomain.com`) must use, for example, Okta authentication.
2. At a **project level**, all logins to a Medplum [Project](/docs/tutorials/register#medplum-projects) must use, for example, Google authentication.
3. At a **client application level**, a specific application, running on a custom domain must, for example, use Auth0 authentication.

## Explicit Account Creation Required

When using external identity providers, you must explicitly invite users to your Project before access will be granted. Accounts are not automatically made for all identities in your external provider. You can [create accounts](/docs/auth/user-guide) programmatically, or invite them manually from the Medplum app.

## Using These Guides

The guides in this section will walk through how to enable external authentication providers in the configuration that suits your use case. We recommend having (1) a firm opinion on which authentication service(s) you want to use, and (2) a high level strategy of what access controls you want to enable as pre-requisites.

## Related FHIR Resources

A Medplum [ProjectMembership](/docs/api/fhir/medplum/projectmembership) has the concept of a `profile`, which indicates what type of membership it represents. For example, is the member a `Practitioner`, or a `Patient`, and a corresponding FHIR resource represents their identity in FHIR. Do not delete the resources associated with the ProjectMembership, as that will cause the related login to be invalid. Editing Patient or Practitioner telecom with an email address will have no effect on their login.
