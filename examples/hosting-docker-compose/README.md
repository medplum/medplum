# self hosting medplum

with docker-compose

## setup prerequisites:

- git
- docker
- make
- sops, age
- keyfile to decrypt the secrets
- mkcert & permission to load the SSL certificate in your broser
- a DNS name i.e. myname.com
    - replace any occurence of myname.com with your chosen name


Then

- (in bash not zsh) `mkcert -key-file key.pem -cert-file cert.pem *.myname.com`
- alternatively ensure your broser to trust the (development) certificates
- generate a keyfile to encrypt the secrets
    - keep in mind the secrets which are hardcoded now are the default secrets of the default medplum configuration and should be replaced for a production setup
    - you can learn more about sops & age https://georgheiler.com/2023/12/01/securing-secrets-with-mozilla-sops-and-age-a-powerful-combo/
    - generate the key with: `age-keygen -o key.txt`
    - set the public key in the makefile and replace the value here: `SOPS_AGE_PUBLIC_KEY=yourkey`

```

steps

- https://www.medplum.com/docs/self-hosting/running-medplum-docker-container
- https://www.medplum.com/docs/self-hosting/config-settings
- https://www.medplum.com/docs/contributing/run-the-stack
- The default username is `admin@example.com`, default password `medplum_admin`.

> Ensure you have the keyfile to decrypt the secrets!

```
# if you have secrets to decrypt
# make secrets-decrypt

# if you want to use make
# make start
docker compose up
```

- validate server is running: http://api.myname.com:8103/healthcheck
- open frontend at https://app.myname.com
