---
id: mtls
title: Mutual TLS (mTLS)
weight: 50
docs_tags: [auth]
---

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
2. An X.509 client certificate (and its private key). It can be self-signed or issued by a CA. Either way, the client certificate itself is added to the trust store.
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

You can also use a certificate issued by your organization's internal CA or a third-party CA. Add the issued client certificate to the trust store, not the CA certificate.

## Configuring the ClientApplication

Set the `certificateTrustStore` field on the `ClientApplication` to the PEM-encoded client certificate(s) that are allowed to authenticate as this client, for example the contents of `client.crt`.

The presented certificate must exactly match a certificate in the trust store. Certificates issued by a CA in the trust store are **not** accepted, so do not add CA or intermediate certificates.

Multiple PEM certificates can be concatenated in the same field. To rotate a certificate, add the new certificate, switch the client over, then remove the old one.

You can set this via the Medplum App UI (the field is on the ClientApplication edit page) or via the FHIR API:

```json
{
  "resourceType": "ClientApplication",
  "name": "My Integration Client",
  "certificateTrustStore": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
}
```

## Obtaining a Token

{{< note >}}
mTLS authentication is only available on the dedicated mTLS endpoint: **`https://mtls.api.medplum.com`**. Requests to the standard `https://api.medplum.com` endpoint will not include a client certificate and cannot use mTLS authentication.
{{< /note >}}

Once infrastructure is configured (see below), make a standard `client_credentials` token request — but **omit the `client_secret`**. The server authenticates the client via the certificate presented at the TLS layer.

{{< tabs groupId="language" >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl -X POST https://mtls.api.medplum.com/oauth2/token \
    --cert client.crt \
    --key client.key \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$MY_CLIENT_ID"
```

  {{< /tab >}}

  {{< tab value="python" label="Python" >}}

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

  {{< /tab >}}
{{< /tabs >}}

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

The `certificateTrustStore` field accepts one or more PEM-encoded client certificates concatenated together. A client certificate is accepted only if it exactly matches one of them, whether it is self-signed or CA-signed. For example, during a rotation:

```
-----BEGIN CERTIFICATE-----
<current client certificate>
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
<new client certificate>
-----END CERTIFICATE-----
```

## Further Reading

- [RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens](https://datatracker.ietf.org/doc/html/rfc8705)
- [Da Vinci PAS — Privacy, Safety, and Security](https://hl7.org/fhir/us/davinci-pas/privacy.html) (HTI-4 / electronic prior auth mTLS requirements)
- [Client Credentials Flow](./client-credentials)
