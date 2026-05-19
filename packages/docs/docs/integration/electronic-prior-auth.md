sidebar_position: 100

# Electronic Prior Auth

:::info[]
Medplum CMS-0057-F Electronic Prior Auth is currently in alpha.
:::

This document describes the recommended process for establishing connectivity and beginning CRD (Coverage Requirements Discovery) testing with Medplum.

The goal is to help implementation partners get to a successful first CDS Hooks exchange as quickly as possible.

## Overview

Medplum supports CMS-0057-F connectivity and testing using:

- CDS Hooks
- OAuth2 Client Credentials
- OAuth2 JWT Client Assertion (JWKS)
- Optional mTLS

Our staging environments are intended for interoperability and conformance testing with payer and provider partners.

## Environment Endpoints

### CDS Hooks Base URL

Standard:

```txt
https://api.staging.medplum.dev/cds-services
```

mTLS:

```txt
https://mtls.api.staging.medplum.dev/cds-services
```

### OAuth2 Token Endpoint

Standard:

```txt
https://api.staging.medplum.dev/oauth2/token
```

mTLS:

```txt
https://mtls.api.staging.medplum.dev/oauth2/token
```

## Supported Authentication Methods

Medplum supports the following OAuth2 client authentication methods:

| Method                                   | Supported |
| ---------------------------------------- | --------- |
| `client_id + client_secret`              | Yes       |
| JWT Client Assertion (`private_key_jwt`) | Yes       |
| mTLS                                     | Optional  |

For initial testing, we generally recommend starting with:

```txt
client_id + client_secret
```

This minimizes setup complexity and helps isolate connectivity issues before introducing JWKS or mTLS.

## Client Registration Information

To establish connectivity, partners should provide:

### For Client Secret Authentication

- Preferred client name
- Redirect/contact information if applicable

### For JWT Client Assertion

- Issuer URL
- JWKS URI

Example:

```txt
Issuer:
https://partner.example.com

JWKS:
https://partner.example.com/.well-known/jwks.json
```

### For mTLS

Please provide:

- Client certificate
- Certificate chain (if applicable)
- Expected TLS configuration details

## Important CDS Hooks Discovery Requirement

Before invoking any CDS Hooks service, clients MUST first retrieve the CDS service discovery document:

```http
GET /cds-services
```

Example:

```http
GET https://api.staging.medplum.dev/cds-services
```

The response contains a list of available CDS services.

Each service has:

- `id`
- `hook`
- additional metadata

### Important

The CDS Hooks `hook` name is NOT the same as the service endpoint path.

Incorrect:

```http
POST /cds-services/order-sign
```

Correct:

```http
POST /cds-services/{service.id}
```

Workflow:

1. Call `GET /cds-services`
2. Find the service matching your desired hook
3. Invoke using the returned `service.id`

## Example CRD Flow

### Step 1 — Discover Services

```http
GET /cds-services
Authorization: Bearer {token}
```

### Step 2 — Find Desired Hook

Example service:

```json
{
  "hook": "order-sign",
  "id": "6f1869c9-e217-4225-9047-bbbc5499f35b"
}
```

### Step 3 — Invoke Service

```http
POST /cds-services/6f1869c9-e217-4225-9047-bbbc5499f35b
Content-Type: application/json
Authorization: Bearer {token}
```

## CDS Hooks Payload Guidance

### Stable Identifiers

During testing, some systems dynamically generate transient resource IDs.

To improve interoperability, Medplum recommends preserving stable identifiers where possible, especially:

- `Patient.id`
- `Patient.identifier`
- Coverage/member identifiers

In practice, payer systems often need stable identifiers to determine which mock/test scenario should be returned.

### Coverage Data

Coverage information should be included using standard CRD prefetch patterns.

Recommended:

```json
"prefetch": {
  "coverageBundle": {
    "resourceType": "Bundle",
    ...
  }
}
```

Avoid relying on non-required fields unless explicitly agreed upon between partners.

## Expected Response Format

Successful responses typically resemble:

```json
{
  "cards": [],
  "systemActions": []
}
```

An empty `cards` array may still indicate a successful invocation.

## Error Handling

Medplum returns standard FHIR `OperationOutcome` resources for many error conditions.

Example:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "not-found"
    }
  ]
}
```

Many responses also include tracing metadata extensions:

- `requestId`
- `traceId`

Please include these identifiers when reporting issues.

## Environment Expectations

### Availability

The staging environment is generally available 24/7.

However:

- it is not SLA-backed
- test data may occasionally be reset
- mock payer logic may evolve during testing cycles

Partners should expect occasional non-production instability.

## Recommended Testing Sequence

We recommend the following onboarding order:

1. Verify OAuth token acquisition
2. Verify `GET /cds-services`
3. Verify CDS Hooks invocation
4. Validate CRD payload structure
5. Introduce JWT assertions if desired
6. Introduce mTLS if required
7. Run full CMS-0057-F scenarios

## Troubleshooting Checklist

### 404 Errors

Common causes:

- Posting directly to `/cds-services/{hook}`
- Incorrect service ID
- Expired/reset staging data

### Empty Responses

Possible causes:

- Test scenario identifiers not preserved
- Missing or incomplete patient/coverage data
- Mock payer unable to determine expected scenario

### Authentication Failures

Verify:

- Token endpoint URL
- JWKS reachability
- JWT issuer alignment
- OAuth scopes
- mTLS certificate configuration

## Support & Coordination

If issues arise during testing, please provide:

- Full request payloads
- Response payloads
- Request IDs / trace IDs
- Timestamp of request
- Whether traffic was routed through the Drummond proxy

Scheduling live troubleshooting sessions is often the fastest way to resolve interoperability issues.
