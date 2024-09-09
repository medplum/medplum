# Medplum Agent

On-prem agent for device connectivity.

> [!WARNING]
> The Medplum Agent is currently in "alpha", and not ready for production use.
>
> Please [contact Medplum](mailto:hello@medplum.com) if you would like to learn more or get involved.

## Building

Published releases are built using Github Actions. See the [installer build script](../../scripts/build-agent-installer.sh) for details.

The following tools are used to build the agent:

- [Node.js](https://nodejs.org/en/)
- [Vercel pkg](https://github.com/vercel/pkg) to build the `.exe` file
- [NSIS](https://nsis.sourceforge.io/) to build the installer
- [Shawl](https://github.com/mtkennerly/shawl) for the Microsoft Windows service wrapper
- [JSign](https://ebourg.github.io/jsign/) to sign the executable files

The following environment variables are required:

- `SM_HOST` - DigiCert Signing Manager host
- `SM_API_KEY` - DigiCert Signing Manager API key
- `SM_CLIENT_CERT_FILE_BASE64` - DigiCert Signing Manager client certificate file (base64 encoded)
- `SM_CLIENT_CERT_PASSWORD` - DigiCert Signing Manager client certificate password
- `SM_CERT_ALIAS` - DigiCert Signing Manager certificate alias

The `SM_CLIENT_CERT_FILE_BASE64` environment variable can be generated from the certificate file:

```bash
base64 Certificate_pkcs12.p12
```

References:

- [Sign with SMCTL](https://docs.digicert.com/en/software-trust-manager/sign-with-digicert-signing-tools/sign-with-smctl.html)
- [GitHub Actions script integration with PKCS11](https://docs.digicert.com/en/software-trust-manager/ci-cd-integrations/script-integrations/github-actions-integration-with-pkcs11.html)
- [Sign with jSign](https://docs.digicert.com/en/software-trust-manager/signing-tools/jsign.html)
- [JSign](https://ebourg.github.io/jsign/)
- [Shawl](https://github.com/mtkennerly/shawl)
- [NSIS](https://nsis.sourceforge.io/)

## Docker Image

Build and run the docker image

```bash
docker build -t medplum-agent:latest \
  --build-arg GIT_SHA=$(git log -1 --format=format:%H) \
  --build-arg MEDPLUM_VERSION=3.0.3 .
```

```bash
docker run --rm \
  -e MEDPLUM_BASE_URL="" \
  -e MEDPLUM_CLIENT_ID="" \
  -e MEDPLUM_CLIENT_SECRET="" \
  -e MEDPLUM_AGENT_ID="" \
  medplum-agent:latest
```

Optionally set the `MEDPLUM_LOG_LEVEL` environment variable
```bash
  -e MEDPLUM_LOG_LEVEL="DEBUG"
```
