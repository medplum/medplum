# Branding and Customization

When building an EHR, you often want to change the logo and name of your platform for clarity or branding. In Medplum, this is simple:

1. Get your Logo ready
2. Edit your `packages/app/.env` file
3. Build and see your results

## Adding Your Logo

### Local file

Drop your logo into the static folder:

```
packages/app/static/img/your-logo.svg
```

Files in `packages/app/static/` are served at the root of your app, so this becomes `/img/your-logo.svg`.

### External URL

Or host your logo elsewhere and use the full URL:

```
https://cdn.example.com/your-logo.svg
```

:::tip[]
Use SVG format when possible — they scale perfectly and have smaller file sizes.
:::

## Configuration

Add your branding variables to `packages/app/.env`:

### Environment Variables

```bash
MEDPLUM_LOGO_URL=/img/your-logo.svg
MEDPLUM_APP_NAME=Your Health Platform
```

:::note[]
These are **build-time** variables. You must rebuild the app after any changes.
:::

Then build and run:

```bash
cd packages/app
npm run build
npm run dev
```

For production deployments, see [Install from scratch](/docs/self-hosting/install-from-scratch) or [Install on AWS](/docs/self-hosting/install-on-aws).

## Beyond the app UI

`MEDPLUM_APP_NAME` and `MEDPLUM_LOGO_URL` are build-time variables for the app, so they are server-wide and the server itself cannot read them. Content generated elsewhere is branded per Project or per client instead, which is also what lets tenants on a shared server each use their own name:

- [`appName`](/docs/auth/mfa#branding-mfa-emails-and-authenticator-apps) — a `Project.setting` entry naming the project in MFA emails, authenticator app entries, and the email sender name
- [`ClientApplication.signInForm`](/docs/api/fhir/medplum/clientapplication) — `welcomeString` and `logo` for the login page, per client application
- [Project SMTP](/docs/user-management/project-smtp) — sender domain and address for all project emails
- [Custom Emails](/docs/user-management/custom-emails) — full control of welcome and password reset email content

## Troubleshooting

**Logo not showing?**

- Check the file exists at the path you specified
- Make sure you rebuilt after changing `.env`
- Clear your browser cache

**App name not changing?**

- Variable must be exactly `MEDPLUM_APP_NAME`
- Rebuild and clear cache
