# Medplum Agent

On-prem agent for device connectivity.

## Building

Published releases are built using Github Actions. See the [build-agent workflow](../../.github/workflows/build-agent.yml) for details.

The following tools are used to build the agent:

- [Node.js](https://nodejs.org/en/)
- [Node.js Single Executable Applications](https://nodejs.org/docs/latest/api/single-executable-applications.html) to build the `.exe` file
- [NSIS](https://nsis.sourceforge.io/) to build the installer
- [Shawl](https://github.com/mtkennerly/shawl) for the Microsoft Windows service wrapper
- [Azure Trusted Signing](https://azure.microsoft.com/en-us/products/trusted-signing) to sign the executable files

The following environment variables are required for signing:

- `AZURE_TENANT_ID` - Azure Active Directory tenant ID
- `AZURE_CLIENT_ID` - Azure application client ID
- `AZURE_CLIENT_SECRET` - Azure application client secret (or use OIDC authentication)
- `AZURE_CODE_SIGNING_ENDPOINT` - Azure Trusted Signing endpoint (e.g., https://eus.codesigning.azure.net/)
- `AZURE_CODE_SIGNING_ACCOUNT_NAME` - Azure Trusted Signing account name
- `AZURE_CODE_SIGNING_PROFILE_NAME` - Azure Trusted Signing certificate profile name
- `GPG_PASSPHRASE` - GPG passphrase for signing the installer
- `GPG_KEY_ID` - GPG key ID for signing the installer

References:

- [Azure Trusted Signing Action](https://github.com/Azure/trusted-signing-action)
- [Azure Trusted Signing Documentation](https://learn.microsoft.com/azure/trusted-signing/)
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
