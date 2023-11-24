---
sidebar_position: 5
tags: [auth]
---

# Google Authentication

Google Authentications allows users to log in to your application using their Google profile.

By default, Medplum automatically syncs user profile data with each user login, thereby ensuring that changes made in the connection source are automatically updated in Medplum. Optionally, you can disable user profile data synchronization to allow for updating profile attributes from your application.

## Prerequisites

Before you begin:

- [Sign up for a Google Developer account.](https://console.developers.google.com/)
- [Create a Google Project](https://support.google.com/googleapi/answer/6251787?ref_topic=7014522#zippy=%2Ccreate-a-project)

## Create Google OAuth consent screen

Configure your OAuth consent screen and create credentials in the [Google Developer Console](https://console.cloud.google.com/apis/credentials/consent).

While setting up your OAuth consent screen, use the following settings:

| Field              | Value to Provide |
| ------------------ | ---------------- |
| User Type          | External         |
| Application Type   | Select Public.   |
| Authorized domains | medplum.com      |

While setting up OAuth scopes, the minimum scopes required are:

- "./docs/auth/userinfo.email"
- "./docs/auth/userinfo.profile"
- "openid"

If your application requests sensitive OAuth scopes or uses a custom image, Google will limit it to 100 logins until the OAuth consent screen is verified. Verification can take several days. To learn more about sensitive scopes, see Google's OAuth 2.0 Scopes for Google APIs documentation.

To pass verification you will need to prove ownership of all Authorized domains you specify on Google's OAuth consent screen. If you're using custom domains, use your custom domain instead of medplum.com.

## Create Google credentials

Create Google OAuth Client Credentials using Google's [Setting up OAuth 2.0](https://support.google.com/googleapi/answer/6158849) documentation.

While setting up your credentials, use the following settings:

| Field                         | Value to Provide                   |
| ----------------------------- | ---------------------------------- |
| Application type              | Web application                    |
| Authorized JavaScript origins | https://YOUR_DOMAIN                |
| Authorized redirect URIs      | https://YOUR_DOMAIN/login/callback |

When you successfully create the OAuth client, you will receive a **Client ID** and **Client Secret**. Google will present you with the option to "Download JSON". Do this, and save the JSON file for next steps.

You can initiate a login attempt using the Medplum Client with the [`startGoogleLogin`](/docs/sdk/core.medplumclient.startgooglelogin) convenience method.

## Add Google Client ID to your Project

Go to the [sites](https://app.medplum.com/admin/sites) section of your admin console to set up your domain.

### Add Google Client ID to your SignInForm

If using the Medplum React Component library, add your Google Client ID:

```tsx
<SignInForm onSuccess={() => navigate('/')} googleClientId={process.env.GOOGLE_CLIENT_ID}>
  <Logo size={32} />
  <h1>Sign in to Foo Medical</h1>
</SignInForm>
```

You may want to use environment variables. Check your build tool for instructions. For example, with Webpack:

```tsx
<SignInForm onSuccess={() => navigate('/')} googleClientId={process.env.GOOGLE_CLIENT_ID}>
  <Logo size={32} />
  <h1>Sign in to Foo Medical</h1>
</SignInForm>
```

### Update app deployment with auth keys

To add Google auth to a [`@medplum/app`](/docs/app) deployment, modify the corresponding configuration file:

```js
{
  // ...
  "googleClientId": "<Google API key>",
  "recaptchaSiteKey": "<ReCAPTCHA API key>"
}
```

Then, [re-deploy the app](/docs/self-hosting/install-on-aws#deploy-the-app) using the CLI:

```
npx medplum aws update-app <environment>
```
