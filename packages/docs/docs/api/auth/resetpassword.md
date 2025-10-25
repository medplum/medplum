import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Reset Password Endpoint

## POST `/auth/resetpassword`

Initiates a password reset for a user. If successful, sends a password reset email to the user (unless `sendEmail` is set to false which is recommended for custom reset password flows). Then, the redirectUri in the email sent to the user will bring the user to a page that calls the [/auth/setpassword](/docs/api/auth/setpassword) endpoint after the user enters their new password.

Check out [custom emails](/docs/user-management/custom-emails) for directions to create a custom reset password flow.

:::info
To see an example, check out the the code for the Medplum app's reset password page in [`ResetPasswordPage.tsx`](https://github.com/medplum/medplum/blob/main/packages/app/src/ResetPasswordPage.tsx).
:::

:::warning
Please note that you may need to specify _projectId_ if your User is project scoped and _recaptchaSiteKey_ and _recaptchaToken_ if you are using your own recaptcha keys.
:::

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User's email address (3-72 characters) |
| projectId | string | No | Project ID for project-scoped users. See [project scoped users](/docs/user-management/project-vs-server-scoped-users#project-scoped-users) Omit for system-level users |
| sendEmail | boolean | No | Whether to send Medplum labeled reset email (defaults to true) |
| redirectUri | string | No | URI to redirect after password reset |
| recaptchaSiteKey | string | No | reCAPTCHA site key for verification |
| recaptchaToken | string | No | reCAPTCHA token for verification |

### Response

Returns a 200 OK response regardless of whether a user was found.

### Example

```typescript
await medplum.post('auth/resetpassword', {
  email: 'user@example.com',
  projectId: 'project-123',
  sendEmail: true,
  redirectUri: 'https://app.example.com/reset',
  recaptchaSiteKey: '6LeIxAcTAAAAAJ55555555555555555555555555555555',
  recaptchaToken: 'recaptcha-token'
});
```

### Notes

- When resetting password for project-scoped users, `projectId` must be provided
- Omit `projectId` when resetting password for system-level users
- If you are building a custom reset password email, set sendEmail to false
