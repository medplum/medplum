# Presigned URLs

**Presigned URLs** are a secure mechanism Medplum uses to serve binary content (images, videos, documents). They grant **temporary, authenticated access**, allowing the content to be safely embedded in web applications using native HTML tags like `<img>` and `<video>` without requiring extra authentication headers.

For more details about how binary data works in Medplum, see [Binary Data](/docs/fhir-datastore/binary-data).

In order to use presigned URLs, you must generate a signing key.

| Storage Provider                                           | Key Generation Method           |
| :--------------------------------------------------------- | :------------------------------ |
| [AWS S3 and Cloudfront](/docs/self-hosting/install-on-aws) | **Automatic** (via Medplum CLI) |
| [GCP](/docs/self-hosting/install-on-gcp)                   | **Manual**                      |
| [Azure](/docs/self-hosting/install-on-azure)               | **Manual**                      |
| [Ubuntu](/docs/self-hosting/install-on-ubuntu)             | **Manual**                      |

## Generating a Signing Key

Use OpenSSL to generate an RSA key pair with a length of 2048 bits and save to the file named `private_key.pem`.

```bash
openssl genrsa -out private_key.pem -passout pass:$PASSCODE 2048
```

The resulting file contains both the public and the private key. The following example command extracts the public key from the file named private_key.pem.

```bash
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

Once the key pair is generated, you must distribute the values to the correct configuration properties:

- `storagePublicKey`: Copy the contents of `public_key.pem` into this property of your CDK configuration file.
- `signingKey`: Copy the contents of `private_key.pem` into this property of your server configuration.
- `signingKeyPasscode`: Copy the `$PASSCODE` used during key generation into this property of your server configuration.

## Default Signing Keys (Local Development)

If the Medplum server is configured to serve binary content directly and no signing key is present, then Medplum will generate a temporary signing key at startup. This provides a convenient out-of-the-box experience for local development, but there are two important caveats:

1. The temporary signing key is unique per server, so it will not work in a multi-server clustered environment.
2. The temporary signing key is temporary, and will not survive server restarts, so any presigned URLs generated will require a refresh.

:::note

Security Update: Historically, Medplum example configuration files included a hardcoded sample signing key. We have removed these keys entirely to eliminate the risk of accidental usage in production and to enforce best security practices from the start.

:::
