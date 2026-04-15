---
sidebar_position: 4
tags: [auth]
---

import BrowserOnlyTabs from '@site/src/components/BrowserOnlyTabs';
import TabItem from '@theme/TabItem';

# Mutual TLS (mTLS)

Mutual TLS (mTLS) is a client authentication mechanism built on top of standard TLS. In addition to the server presenting a certificate to the client (standard TLS), the client also presents an X.509 certificate to the server, which verifies it against a configured trust store. This provides strong, cryptographic proof of client identity without transmitting a shared secret.

## When to Use mTLS

mTLS is an alternative to the standard [Client Credentials](./client-credentials) flow for machine-to-machine authentication. Consider mTLS when:

- A trading partner or payer **requires** it — mTLS is an optional but increasingly expected part of the [Da Vinci Prior Authorization Support (PAS)](https://hl7.org/fhir/us/davinci-pas/privacy.html) specification (HTI-4 / electronic prior auth), and some payers are making it mandatory.
- You want to eliminate shared secrets entirely and rely solely on PKI for client authentication.
- Your security policy mandates certificate-based authentication for system integrations.

Medplum's mTLS support follows [RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens](https://datatracker.ietf.org/doc/html/rfc8705).

## Prerequisites

This tutorial assumes you already have a Medplum account. (If not, please [register](https://app.medplum.com/register).)

You will need:

1. A [ClientApplication](https://app.medplum.com/ClientApplication) — create one on the [Project Admin page](https://app.medplum.com/admin/clients).
2. An X.509 client certificate (and its private key). This can be either:
   - A **self-signed certificate** — the certificate itself is added to the trust store.
   - A **CA-signed certificate** — the issuing CA certificate (or chain) is added to the trust store.
3. An mTLS-capable load balancer (AWS ALB recommended) or a reverse proxy configured to pass the client certificate to Medplum in the `x-amzn-mtls-clientcert` header (passthrough mode) or `x-amzn-mtls-clientcert-leaf` header (verify mode). See [Infrastructure Setup](#infrastructure-setup) below.

## Generating a Certificate

If you do not already have a certificate, you can generate a self-signed one with OpenSSL:

```bash
# Generate a private key
openssl genrsa -out client.key 2048

# Generate a self-signed certificate (valid for 365 days)
openssl req -new -x509 -key client.key -out client.crt -days 365 \
  -subj "/CN=My Integration Client/O=My Organization"
```

For production use, issue the certificate from your organization's internal CA or a trusted third-party CA and add the CA certificate to the trust store rather than the leaf certificate.

## Configuring the ClientApplication

Set the `certificateTrustStore` field on the `ClientApplication` to the PEM-encoded certificate(s) that are trusted to authenticate as this client.

- For a **self-signed** certificate: paste the contents of `client.crt`.
- For a **CA-signed** certificate: paste the CA certificate (or the full chain). Multiple PEM certificates can be concatenated in the same field.

You can set this via the Medplum App UI (the field is on the ClientApplication edit page) or via the FHIR API:

```json
{
  "resourceType": "ClientApplication",
  "name": "My Integration Client",
  "certificateTrustStore": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
}
```

## Obtaining a Token

:::note
mTLS authentication is only available on the dedicated mTLS endpoint: **`https://mtls.api.medplum.com`**. Requests to the standard `https://api.medplum.com` endpoint will not include a client certificate and cannot use mTLS authentication.
:::

Once infrastructure is configured (see below), make a standard `client_credentials` token request — but **omit the `client_secret`**. The server authenticates the client via the certificate presented at the TLS layer.

<BrowserOnlyTabs groupId="language">
  <TabItem value="curl" label="cURL">

```bash
curl -X POST https://mtls.api.medplum.com/oauth2/token \
    --cert client.crt \
    --key client.key \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$MY_CLIENT_ID"
```

  </TabItem>

  <TabItem value="python" label="Python">

```python
import requests

def get_mtls_token(token_url, client_id, cert_path, key_path):
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    body = {
        "grant_type": "client_credentials",
        "client_id": client_id,
    }
    response = requests.post(
        token_url,
        data=body,
        headers=headers,
        cert=(cert_path, key_path),  # mTLS client certificate
    )
    return response.json()["access_token"]
```

  </TabItem>
</BrowserOnlyTabs>

On success, the response is a standard OAuth2 token response:

```json
{
  "token_type": "Bearer",
  "access_token": "<YOUR_AUTH_TOKEN>",
  "expires_in": 3600
}
```

The `access_token` value can then be used in subsequent API requests as a `Bearer` token.

## Infrastructure Setup

Medplum does not terminate TLS itself — it relies on a TLS-terminating reverse proxy or load balancer to extract the client certificate and forward it as an HTTP header. The header name must be configured in the Medplum server configuration via `mtlsCertHeader`.

### AWS Application Load Balancer (Recommended)

AWS ALB supports mTLS in two modes:

| Mode                        | Header forwarded              | `mtlsCertHeader` setting      |
| --------------------------- | ----------------------------- | ----------------------------- |
| Passthrough                 | `x-amzn-mtls-clientcert`      | `x-amzn-mtls-clientcert`      |
| Verify (ALB validates cert) | `x-amzn-mtls-clientcert-leaf` | `x-amzn-mtls-clientcert-leaf` |

Medplum's CDK infrastructure supports a dedicated mTLS load balancer. Configure the following fields in your CDK stack configuration:

```json
{
  "mtlsDomainName": "mtls.api.example.com",
  "mtlsSslCertArn": "arn:aws:acm:us-east-1:123456789012:certificate/...",
  "mtlsInternetFacing": true,
  "mtlsWafIpSetArn": "arn:aws:wafv2:us-east-1:123456789012:ipset/..."
}
```

And in your Medplum server configuration (`medplum.config.json`):

```json
{
  "mtlsCertHeader": "x-amzn-mtls-clientcert"
}
```

### nginx

```nginx
server {
    listen 443 ssl;
    ssl_certificate     /etc/ssl/server.crt;
    ssl_certificate_key /etc/ssl/server.key;

    # Request a client certificate but do not require it here —
    # Medplum validates it against the per-client trust store.
    ssl_verify_client optional_no_ca;

    location /oauth2/token {
        proxy_pass http://medplum-backend;
        proxy_set_header x-mtls-cert $ssl_client_escaped_cert;
    }
}
```

And in your Medplum server configuration:

```json
{
  "mtlsCertHeader": "x-mtls-cert"
}
```

## Certificate Trust Store Options

The `certificateTrustStore` field accepts one or more PEM-encoded certificates concatenated together. Medplum supports:

- **Self-signed certificates** — the exact certificate must be in the trust store.
- **CA-signed certificates** — any certificate signed by a CA in the trust store is accepted. You can include multiple CA certificates to trust certificates from more than one issuer.

```
-----BEGIN CERTIFICATE-----
<CA 1 certificate>
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
<CA 2 certificate>
-----END CERTIFICATE-----
```

## Further Reading

- [RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens](https://datatracker.ietf.org/doc/html/rfc8705)
- [Da Vinci PAS — Privacy, Safety, and Security](https://hl7.org/fhir/us/davinci-pas/privacy.html) (HTI-4 / electronic prior auth mTLS requirements)
- [Client Credentials Flow](./client-credentials)
