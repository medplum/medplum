---
sidebar_position: 1
---

# Contributing to Medplum

### Setup

These are instructions for developers who wish to contribute to the Medplum project. If you want to _use_ the Medplum project, check out the [App](../app) or [API](../api) docs instead.

First things first, you need to [Clone the repo](/community/contributing/clone-the-repo).

After that, you need to build the project. There are two methods for running and developing locally:

1. [Dev on the host](/community/contributing/dev-on-host) including running Postgres and Redis on the host
2. [Dev on docker](/community/contributing/dev-on-docker) without running any services directly on the host

### Which one should you choose?

The core development team all uses option 1, dev on the host, as it provides more control, better debugging, and better runtime performance.

If you are just getting started, and want to experiment quickly, then using Docker will get you up and running faster.
