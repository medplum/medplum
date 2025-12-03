# Azure Trusted Signing Migration

This document describes the changes made to migrate from DigiCert signing to Azure Trusted Signing for the Medplum Agent Windows build process.

## Overview

The Windows agent build process has been updated to use [Azure Trusted Signing](https://azure.microsoft.com/en-us/products/trusted-signing) instead of DigiCert JSign for code signing. This provides better integration with Azure services and supports OIDC authentication.

## Changes Made

### 1. Scripts

#### `scripts/build-agent-installer-win64.sh` (Modified)
- **Purpose**: Step 1 of the build process - Build executable and download dependencies
- **Changes**:
  - Removed all DigiCert-specific code (JSign, certificate handling)
  - Removed signing logic (now handled by the GitHub Action)
  - Simplified to only build the SEA executable and download Shawl
  - Removed Java and DigiCert environment variable checks
  - No longer performs any code signing

#### `scripts/build-agent-installer-win64-final.sh` (New)
- **Purpose**: Step 2 of the build process - Build installer after signing
- **Changes**:
  - New script that handles the final steps after signing
  - Runs makensis to create the installer
  - Generates checksums
  - Creates GPG signature (if not skipping signing)
  - Made executable with proper permissions

### 2. GitHub Workflow

#### `.github/workflows/build-agent.yml` (Modified)
- **Changes to `build_agent_win64` job**:
  - Added `id-token: write` permission for OIDC authentication
  - Split the build process into three steps:
    1. **Build Agent executable and download dependencies** - Runs `build-agent-installer-win64.sh`
    2. **Sign executables with Azure Trusted Signing** - New step using `azure/trusted-signing-action@v0`
       - Only runs when `inputs.sign_output` is true
       - Signs both the Medplum agent executable and Shawl executable in one step
       - Uses Azure Trusted Signing Action with the following configuration:
         - Authenticates using Azure credentials from secrets
         - Signs all `.exe` files in `packages/agent/dist`
         - Uses SHA256 for file digest
         - Timestamps using Microsoft's timestamp server
    3. **Build Agent installer** - Runs `build-agent-installer-win64-final.sh`
       - Includes GPG credentials for installer signing

### 3. Documentation

#### `packages/agent/README.md` (Modified)
- Updated tool list to replace JSign with Azure Trusted Signing
- Updated Node.js build reference to use Single Executable Applications
- Replaced DigiCert environment variables with Azure Trusted Signing variables:
  - Removed: `SM_HOST`, `SM_API_KEY`, `SM_CLIENT_CERT_FILE_BASE64`, `SM_CLIENT_CERT_PASSWORD`, `SM_CERT_ALIAS`
  - Added: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_CODE_SIGNING_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`, `AZURE_CODE_SIGNING_PROFILE_NAME`
  - Kept: `GPG_PASSPHRASE`, `GPG_KEY_ID` (for installer signing)
- Updated references to point to Azure Trusted Signing documentation
- Fixed build script reference to point to the workflow instead of non-existent script

## Required GitHub Secrets

The following secrets need to be configured in your GitHub repository for signing to work:

### Azure Trusted Signing (for executable signing)
- `AZURE_TENANT_ID` - Azure Active Directory tenant ID
- `AZURE_CLIENT_ID` - Azure application client ID
- `AZURE_CLIENT_SECRET` - Azure application client secret (for non-OIDC auth)
- `AZURE_CODE_SIGNING_ENDPOINT` - Azure Trusted Signing endpoint (e.g., `https://eus.codesigning.azure.net/`)
- `AZURE_CODE_SIGNING_ACCOUNT_NAME` - Azure Trusted Signing account name
- `AZURE_CODE_SIGNING_PROFILE_NAME` - Azure Trusted Signing certificate profile name

### GPG (for installer signing)
- `GPG_PASSPHRASE` - GPG passphrase for signing the installer
- `GPG_KEY_ID` - GPG key ID for signing the installer

## Benefits of Azure Trusted Signing

1. **OIDC Support**: Can use OpenID Connect for authentication instead of client secrets
2. **Unified Signing**: Signs multiple files in a single action call
3. **Better Integration**: Native Azure integration for organizations using Azure
4. **Timestamping**: Built-in support for RFC3161 timestamping
5. **Simplified Workflow**: No need to manage Java, JSign, or certificate files in the build process

## OIDC Authentication (Recommended)

For enhanced security, you can configure OIDC authentication instead of using client secrets. See the [Azure Trusted Signing OIDC documentation](https://github.com/Azure/trusted-signing-action/blob/main/docs/OIDC.md) for setup instructions.

With OIDC:
- No need to manage client secrets
- More secure federated authentication
- Requires configuring Federated Credentials in Azure
- The `id-token: write` permission is already configured in the workflow

## Build Process Flow

### With Signing (`sign_output: true`)
1. Install dependencies and build the agent package
2. Run `build-agent-installer-win64.sh`:
   - Build the SEA executable
   - Download Shawl
3. Run Azure Trusted Signing Action:
   - Sign both executables (medplum-agent and shawl)
4. Run `build-agent-installer-win64-final.sh`:
   - Build installer with makensis
   - Generate checksums
   - Sign installer with GPG

### Without Signing (`sign_output: false`)
1. Install dependencies and build the agent package
2. Run `build-agent-installer-win64.sh`:
   - Build the SEA executable
   - Download Shawl
3. Skip signing step
4. Run `build-agent-installer-win64-final.sh`:
   - Build installer with makensis (with SKIP_SIGNING flag)
   - Generate checksums
   - Skip GPG signing

## Migration Checklist

- [x] Update build scripts to remove DigiCert code
- [x] Create new final installer script
- [x] Update GitHub workflow to use Azure Trusted Signing Action
- [x] Add OIDC permission to workflow
- [x] Update documentation
- [ ] Configure Azure Trusted Signing account and certificate profile
- [ ] Add required secrets to GitHub repository
- [ ] Test the workflow with signing enabled
- [ ] (Optional) Configure OIDC authentication for better security

## Testing

To test the new build process:

1. Ensure all required secrets are configured in your repository
2. Trigger the workflow manually via the GitHub Actions UI
3. Select whether to sign the output
4. Monitor the workflow execution to ensure all steps complete successfully
5. Verify the signed executables have valid signatures

## References

- [Azure Trusted Signing Action](https://github.com/Azure/trusted-signing-action)
- [Azure Trusted Signing Documentation](https://learn.microsoft.com/azure/trusted-signing/)
- [OIDC Authentication Setup](https://github.com/Azure/trusted-signing-action/blob/main/docs/OIDC.md)
- [Common Error Codes](https://learn.microsoft.com/azure/trusted-signing/faq#common-error-codes-and-mitigations)

