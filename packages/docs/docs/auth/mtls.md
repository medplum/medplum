---
sidebar_position: 10
tags: [auth, advanced]
---

import BrowserOnlyTabs from '@site/src/components/BrowserOnlyTabs';
import TabItem from '@theme/TabItem';

# mTLS (Mutual TLS) Client Authentication

Mutual TLS (mTLS) is an advanced authentication mechanism that provides strong client authentication using X.509 certificates. This is an **optional** configuration that enhances security for machine-to-machine OAuth flows.

:::info Advanced Feature

mTLS is an advanced security feature designed for enterprise deployments with strict compliance requirements. Most applications do not need mTLS and should use standard [Client Credentials](/docs/auth/client-credentials) authentication instead.

:::

## Overview

Medplum implements mTLS client authentication according to [OAuth 2.0 Mutual-TLS Client Authentication (RFC 8705)](https://datatracker.ietf.org/doc/html/rfc8705). This standard enables OAuth clients to authenticate using X.509 certificates instead of, or in addition to, client secrets.

### Use Cases

mTLS is particularly relevant for:

- **Healthcare Compliance**: Required by some implementations of [HTI-4 (Health Data, Technology, and Interoperability)](https://hl7.org/fhir/us/davinci-pas/privacy.html) specifications, particularly for electronic prior authorization (PAS)
- **FAPI 2.0 Alignment**: Supports [Financial-grade API (FAPI) 2.0](https://github.com/medplum/medplum/discussions/6489) security profiles
- **Zero-trust Architecture**: Provides certificate-based client identity verification
- **High-security Environments**: Where cryptographic client authentication is mandated

### How It Works

1. Client presents an X.509 certificate during TLS handshake
2. AWS Application Load Balancer (ALB) extracts the certificate in "pass-through" mode
3. Certificate is forwarded to the Medplum server via HTTP header
4. Server validates the certificate against the configured trust store
5. If valid, the client is authenticated and receives an OAuth access token

## Using mTLS as an API Consumer

This section covers how to use mTLS to authenticate to a Medplum server that has mTLS enabled.

### Prerequisites

Before using mTLS authentication, you need:

1. **Client Application**: A `ClientApplication` resource with mTLS configured
2. **Client Certificate**: An X.509 certificate (either self-signed or CA-signed)
3. **Private Key**: The private key corresponding to your certificate
4. **mTLS Endpoint**: The mTLS-enabled API endpoint (e.g., `https://api-mtls.staging.medplum.dev`)

### Configuring Your ClientApplication

Your `ClientApplication` must have a `certificateTrustStore` configured. This field contains the PEM-encoded certificate(s) that the server will trust:

```json
{
  "resourceType": "ClientApplication",
  "name": "My mTLS Client",
  "secret": "your-client-secret",
  "certificateTrustStore": "-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----"
}
```

**Trust Store Options:**

- **Self-signed certificates**: Include the exact client certificate in the trust store
- **CA-signed certificates**: Include the Certificate Authority (CA) certificate that signed your client certificate
- **Multiple CAs**: Concatenate multiple CA certificates in the trust store

### Generating Test Certificates

For testing purposes, you can generate self-signed certificates using OpenSSL:

<BrowserOnlyTabs groupId="cert-type">
  <TabItem value="self-signed" label="Self-Signed Certificate">

```bash
# Generate a private key and self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout client-key.pem -out client-cert.pem -days 365 -nodes \
  -subj "/CN=My Test Client"
```

  </TabItem>
  <TabItem value="ca-signed" label="CA-Signed Certificate">

```bash
# Step 1: Generate a CA certificate (if you don't already have one)
openssl req -x509 -newkey rsa:4096 -keyout ca-key.pem -out ca-cert.pem -days 365 -nodes \
  -subj "/CN=My Test CA"

# Step 2: Generate a client private key
openssl genrsa -out client-key.pem 4096

# Step 3: Create a certificate signing request (CSR)
openssl req -new -key client-key.pem -out client-csr.pem \
  -subj "/CN=My Test Client"

# Step 4: Sign the client certificate with the CA
openssl x509 -req -in client-csr.pem -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out client-cert.pem -days 365
```

  </TabItem>
</BrowserOnlyTabs>

:::warning Production Certificates

For production use, obtain certificates from a trusted Certificate Authority (CA) or your organization's PKI infrastructure. Never use self-signed certificates in production unless you fully understand the security implications.

:::

### Making Authenticated Requests

Use the mTLS endpoint with your client certificate and private key:

<BrowserOnlyTabs groupId="language">
  <TabItem value="curl" label="cURL">

```bash
# Using client certificate for mTLS authentication
curl -X POST https://api-mtls.staging.medplum.dev/oauth2/token \
  --cert client-cert.pem \
  --key client-key.pem \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$MY_CLIENT_ID"
```

**Note**: With mTLS, the `client_secret` is not required in the request body. The certificate serves as the authentication credential.

  </TabItem>
  <TabItem value="python" label="Python">

```python
import requests

def get_auth_token_mtls(url, client_id, cert_path, key_path):
    """
    Authenticate using mTLS client certificate.

    Args:
        url: The mTLS OAuth token endpoint (e.g., https://api-mtls.staging.medplum.dev/oauth2/token)
        client_id: Your ClientApplication ID
        cert_path: Path to your client certificate file (PEM format)
        key_path: Path to your private key file (PEM format)
    """
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    body = {
        "grant_type": "client_credentials",
        "client_id": client_id
    }

    # Specify the client certificate and private key
    cert = (cert_path, key_path)

    response = requests.post(url, data=body, headers=headers, cert=cert)
    return response.json()['access_token']

# Example usage
token = get_auth_token_mtls(
    "https://api-mtls.staging.medplum.dev/oauth2/token",
    "your-client-id",
    "client-cert.pem",
    "client-key.pem"
)
```

  </TabItem>
  <TabItem value="nodejs" label="Node.js">

```javascript
import https from 'https';
import fs from 'fs';

async function getAuthTokenMtls(url, clientId, certPath, keyPath) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // Specify the client certificate and private key
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const json = JSON.parse(data);
        resolve(json.access_token);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Example usage
const token = await getAuthTokenMtls(
  'https://api-mtls.staging.medplum.dev/oauth2/token',
  'your-client-id',
  'client-cert.pem',
  'client-key.pem'
);
```

  </TabItem>
</BrowserOnlyTabs>

### Response

On success, the response is identical to standard client credentials flow:

```json
{
  "token_type": "Bearer",
  "access_token": "<YOUR_AUTH_TOKEN>",
  "expires_in": 3600
}
```

The `access_token` can then be used in subsequent API requests with the `Authorization: Bearer <token>` header.

### Endpoint Differences

Medplum deployments with mTLS enabled have two OAuth token endpoints:

| Endpoint | Purpose | Authentication Methods |
|----------|---------|------------------------|
| `https://api.example.com/oauth2/token` | Standard OAuth | Client secret, JWT assertions |
| `https://api-mtls.example.com/oauth2/token` | mTLS OAuth | Client certificates (mTLS) |

**Important**: Regular API requests (e.g., FHIR operations) continue to use the standard endpoint with Bearer tokens. Only the initial OAuth token request uses the mTLS endpoint.

## Enabling mTLS on Your Medplum Server

This section covers how to configure your self-hosted Medplum server to support mTLS client authentication.

:::caution Infrastructure Requirements

Enabling mTLS requires additional AWS infrastructure (a second Application Load Balancer) which incurs additional costs (~$100-200/month). Ensure this cost is justified for your use case before enabling.

:::

### Architecture Overview

Medplum's mTLS implementation uses a **separate Application Load Balancer (ALB)** for mTLS traffic:

- **Standard ALB** (`api.example.com`): Handles regular OAuth and API requests
- **mTLS ALB** (`api-mtls.example.com`): Handles mTLS client authentication requests

Both ALBs forward traffic to the same Medplum server, which validates certificates at the application layer.

### CDK Configuration

To enable mTLS, add the following configuration to your CDK setup:

```typescript
{
  // ... other configuration ...

  // mTLS endpoint configuration
  mtlsDomainName: "api-mtls.staging.medplum.dev",
  mtlsSslCertArn: "arn:aws:acm:us-east-1:123456789012:certificate/abcd1234-...",
}
```

**Configuration Parameters:**

- `mtlsDomainName`: The subdomain for your mTLS endpoint (e.g., `api-mtls.example.com`)
- `mtlsSslCertArn`: The ARN of an AWS Certificate Manager (ACM) certificate for the mTLS domain

### DNS Configuration

Create a DNS record pointing your mTLS subdomain to the mTLS ALB:

```typescript
// This should be added automatically by the CDK stack, but verify:
new route53.ARecord(this, 'MtlsLoadBalancerAliasRecord', {
  recordName: config.mtlsDomainName,
  target: route53.RecordTarget.fromAlias(
    new targets.LoadBalancerTarget(mtlsLoadBalancer)
  ),
  zone: zone,
});
```

### Server Configuration

Configure the Medplum server to extract client certificates from the ALB header:

```json
{
  "mtlsCertHeader": "x-amzn-mtls-clientcert"
}
```

**Header Options:**

- `x-amzn-mtls-clientcert`: For ALB in "pass-through" mode (recommended)
- `x-amzn-mtls-clientcert-leaf`: For ALB in "verify" mode

:::info Pass-Through Mode

Medplum uses ALB in "pass-through" mode, which means the ALB forwards the raw client certificate to the application. The Medplum server then performs certificate validation. This provides more flexibility in trust store management.

:::

### Certificate Trust Store Management

Configure the trust store in your `ClientApplication` resources:

1. Navigate to the ClientApplication in the Medplum admin panel
2. Set the `certificateTrustStore` field with your trusted certificate(s) in PEM format
3. For CA-signed certificates, include the CA certificate
4. For self-signed certificates, include the exact client certificate

**Example Trust Store (Self-Signed):**
```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKKzMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
...
-----END CERTIFICATE-----
```

**Example Trust Store (CA-Signed, Multiple CAs):**
```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKKzMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
... (CA 1 certificate)
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKKzMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
... (CA 2 certificate)
-----END CERTIFICATE-----
```

## Security Considerations

### Certificate Validation

Medplum performs the following validations on client certificates:

1. **PEM Format**: Certificate must be valid PEM-encoded X.509
2. **Expiration**: Certificate must be within its validity period
3. **Trust**:
   - Self-signed certificates must exactly match a certificate in the trust store (by fingerprint)
   - CA-signed certificates must be signed by a CA in the trust store
4. **Signature**: Certificate signature must be cryptographically valid

### Certificate Rotation

Plan for certificate rotation before expiration:

1. Generate new client certificate
2. Update the `certificateTrustStore` in your `ClientApplication` to include both old and new certificates
3. Deploy the new certificate to your client applications
4. Remove the old certificate from the trust store after all clients are updated

### Private Key Security

- **Never commit private keys to version control**
- Store private keys securely (e.g., AWS Secrets Manager, HashiCorp Vault)
- Use appropriate file permissions (e.g., `chmod 600 client-key.pem`)
- Rotate certificates and keys regularly

### Least Privilege

Only grant mTLS access to clients that require it. Use standard client credentials for clients that don't need certificate-based authentication.

## Troubleshooting

### Common Errors

**"Invalid client certificate: No valid PEM certificates found"**
- Certificate is not in valid PEM format
- Certificate header is corrupted or URL-encoded incorrectly
- Check that your certificate file starts with `-----BEGIN CERTIFICATE-----`

**"Invalid client certificate: Certificate expired"**
- Client certificate has expired
- Generate a new certificate with a longer validity period
- Update the trust store with the new certificate

**"Invalid client certificate: Self-signed certificate is not in the trusted certificate list"**
- The client certificate is not in the `certificateTrustStore`
- For self-signed certs, the exact certificate (by fingerprint) must be in the trust store
- Verify that the certificate in the trust store matches the client certificate

**"Invalid client certificate: Certificate validation failed: No matching CA found"**
- For CA-signed certificates, the issuing CA is not in the trust store
- Add the CA certificate to the `certificateTrustStore`
- Verify that the CA certificate is correct and not expired

**"Client does not have a configured certificate trust store"**
- The `ClientApplication` resource does not have `certificateTrustStore` configured
- Add trusted certificates to the `certificateTrustStore` field

### Testing Certificate Validation

Test your certificate locally before deploying:

```bash
# Verify certificate is valid and not expired
openssl x509 -in client-cert.pem -text -noout

# Check certificate expiration date
openssl x509 -in client-cert.pem -noout -enddate

# Verify certificate chain (for CA-signed certs)
openssl verify -CAfile ca-cert.pem client-cert.pem

# Test the certificate against the mTLS endpoint
curl -v --cert client-cert.pem --key client-key.pem \
  https://api-mtls.staging.medplum.dev/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$MY_CLIENT_ID"
```

## Further Reading

- [OAuth 2.0 Mutual-TLS Client Authentication (RFC 8705)](https://datatracker.ietf.org/doc/html/rfc8705)
- [Client Credentials Flow](/docs/auth/client-credentials)
- [HTI-4 Electronic Prior Authorization](https://hl7.org/fhir/us/davinci-pas/privacy.html)
- [FAPI 2.0 Discussion](https://github.com/medplum/medplum/discussions/6489)
- [AWS ALB mTLS Documentation](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/mutual-authentication.html)
