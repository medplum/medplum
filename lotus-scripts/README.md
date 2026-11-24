# Lotus scripts

The files on this folder are used by [lotus-ts](https://github.com/claimpowerehr/lotus-ts/) to build the medplum dependencies

## AWS & Terraform

Our code is deployed to AWS in two environments for redundancy and security

`dev`

dev.lotuscares.ai

`www`

www.lotuscares.ai

The infrascture is synchronized via terraform with configuration files found in `lotus-ts`

## Dockerfiles

The `server` package uses Docker to build an image that is served via ecs,

Dockerfiles are in the root of this project `../` because of the build context

## Buildspecs

The `app` package uses a buildspec to build and sync with a public S3 folder where is served

Both packages build using symlinks to other packages in this repo to have the most recent codechanges in every dependency


## Node Version


Building using `node-20.slim`


