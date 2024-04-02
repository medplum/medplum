# Medplum OAuth Demo

This is a demonstration of how to use Medplum with an External Auth Provider or "Federated Identities".

This repo is similar to [medplum-client-oauth-demo](https://github.com/medplum/medplum-client-oauth-demo), except that is uses an external identity provider.

![image](https://user-images.githubusercontent.com/749094/216679854-c09c752d-df7d-46b4-9aa9-1f2a10f82406.png)

## Setup

Setup your external authentication provider (Auth0, AWS Cognito, Okta, etc).  Use "https://api.medplum.com/auth/external" as the "redirect URI". Note the following details:

- Authorize URL
- Token URL
- UserInfo URL
- Client ID
- Client secret

Setup your Medplum account:

- [Register for a Medplum account](https://docs.medplum.com/tutorials/app/register)
- Create a `ClientApplication`
- Set the "Redirect URI" to "http://localhost:8000/"
- Add an external identity provider with the details from above

Update the values in `src/main.ts` accordingly.

Now you can run this demo:

```bash
npm run dev
```

Open your web browser to <http://localhost:8000/>
