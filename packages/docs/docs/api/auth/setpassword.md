# Set Password Endpoint

## POST `/auth/setpassword`

:::note
To see an example of the Medplum app's set password page, check out the code in [`SetPasswordPage.tsx`](https://github.com/medplum/medplum/blob/main/packages/app/src/SetPasswordPage.tsx). Notice that the page 
:::

Sets a new password for a user using a security request token. This endpoint is used to complete both password reset and user invitation flows. After redirect from the reset password or invite email, this endpoint can be called with the following parameters:

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | The UserSecurityRequest ID received from the reset password email |
| secret | string | Yes | The security token received from the reset password email |
| password | string | Yes | The new password (must be at least 8 characters) |

### Response

- Returns `200 OK` if the password was successfully set
- Returns `400 Bad Request` if:
  - The security request has already been used
  - The secret is incorrect
  - The password is found in breach database
  - The password is less than 8 characters

### Example

```typescript
await medplum.post('auth/setpassword', {
  id: 'security-request-id',
  secret: 'security-token',
  password: 'new-password'
});
```
