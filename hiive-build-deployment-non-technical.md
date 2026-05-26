# Hiive Build Medplum Deployment - Non-Technical Summary

Last updated: 2026-05-01

## What This Is

This is a plain-language summary of the Medplum environment that was set up for the Hiive build environment.

If you need the full technical details, see `hiive-build-deployment.md`.

## Current Status

The Medplum environment is live and available.

- The Medplum web app is up
- The backend API is up
- File storage is set up
- Secure HTTPS URLs are in place

## Where It Is Hosted

- AWS account: `476905305808`
- AWS environment name: `build`
- AWS SSO profile used by the technical team: `hiive-build`

Most non-technical users do not need AWS access or the SSO profile.

## Main URLs

- Medplum app: `https://app.ehr.hiivehealth.net/`
- Medplum API: `https://api.ehr.hiivehealth.net/`
- Medplum storage base: `https://storage.ehr.hiivehealth.net/binary/`

## First Login

The initial administrator account created by Medplum is:

- Email: `admin@example.com`
- Password: `medplum_admin`

This password should be changed immediately after first login.

## What Was Installed

In simple terms, the following pieces are now in place:

- A secure Medplum web application
- A backend service that runs the Medplum platform
- A database for platform data
- Secure file storage for uploaded content
- Public internet access through the Hiive URLs above
- Security certificates for HTTPS

## What Non-Technical Users Can Do Now

- Log into the Medplum app
- Change the initial admin password
- Create the first Medplum project
- Invite users into that project
- Begin basic validation of the environment

## Current Limitations / Important Notes

- Public self-sign-up is not currently enabled.
- The storage URL is not meant to be opened directly in a browser.
- Email sending is still in AWS SES sandbox mode.
- While SES is in sandbox mode, invite emails and other system emails are limited to verified email identities.

## Support / Handoff Notes

- Technical deployment details are documented in `hiive-build-deployment.md`.
- Technical administration for this environment should use the AWS SSO profile `hiive-build`.
- If a non-technical stakeholder only needs to access the system, the main URL is `https://app.ehr.hiivehealth.net/`.