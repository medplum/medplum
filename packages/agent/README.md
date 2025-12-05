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

### Authentication and Signing

The build process uses [OpenID Connect (OIDC)](https://www.microsoft.com/security/business/security-101/what-is-openid-connect-oidc) to authenticate with Azure Trusted Signing. This provides secure, secret-free authentication using federated credentials.

#### Required GitHub Secrets

**For Azure OIDC Authentication:**
- `AZURE_TENANT_ID` - Azure Active Directory tenant ID
- `AZURE_CLIENT_ID` - Azure application client ID (from service principal with federated credentials)
- `AZURE_SUBSCRIPTION_ID` - Azure subscription ID

**For GPG Signing:**
- `MEDPLUM_RELEASE_GPG_KEY` - The private GPG key (imported before signing)
- `MEDPLUM_RELEASE_GPG_KEY_ID` - GPG key identifier
- `MEDPLUM_RELEASE_GPG_PASSPHRASE` - GPG key passphrase

#### Setup Instructions

To configure OIDC authentication for Azure Trusted Signing:

1. Create a Microsoft Entra application and service principal
2. Add federated credentials for GitHub Actions
3. Assign the **Trusted Signing Certificate Profile Signer** role to your service principal
4. Configure the required GitHub secrets

For detailed setup instructions, see [Authenticating with OpenID Connect](https://github.com/Azure/trusted-signing-action/blob/main/docs/OIDC.md).

#### References

- [Azure Trusted Signing Action](https://github.com/Azure/trusted-signing-action)
- [Azure Trusted Signing with OIDC](https://github.com/Azure/trusted-signing-action/blob/main/docs/OIDC.md)
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
