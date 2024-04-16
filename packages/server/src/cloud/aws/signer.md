# Medplum Signer

Instructions for how to create a AWS CloudFront signer:

https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html#private-content-creating-cloudfront-key-pairs

## 1. Create the public-private key pair

The following example command uses OpenSSL to generate an RSA key pair with a length of 2048 bits and save to the file named private_key.pem.

```bash
openssl genrsa -out private_key.pem -passout pass:foobar 2048
```

The resulting file contains both the public and the private key. The following example command extracts the public key from the file named private_key.pem.

```bash
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

## 2. Add the public key to the CDK config

Copy the contents of public_key.pem into the "storagePublicKey" property of your CDK config file.

## 5. Add the private key to server config

Copy the contents of private_key.pem into the "signingKey" property of your server config.
