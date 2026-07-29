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

## Server-generated content

These variables only cover the app UI. Content the server generates on a user's behalf is branded per Project instead, so tenants on a shared server can each use their own name:

- [`brandName`](/docs/auth/mfa#branding-mfa-emails-and-authenticator-apps) — MFA verification emails and authenticator app entries
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
