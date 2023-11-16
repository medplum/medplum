## medplum-nextauth-demo

## Description: ##
Simple Medplum demo using NextJs configured with NextAuth

## Note: ##

Created Next.js app with the following command, accepting all defaults.

```
npx create-next-app@latest medplum-nextauth-demo
```
Create .env.local file with the following

- NEXTAUTH_SECRET=
- MEDPLUM_CLIENT_ID=
- MEDPLUM_SECRET_ID=

Create NEXTAUTH_SECRET with the following command.
```
openssl rand -base64 32
```
