---
sidebar_position: 10
---

# Clone the repo

Ah, you're ready to get your hands dirty, eh? Great! Let's get you setup with a cloned repo.

:::danger

fork

:::

To clone the repo, run the following command:

```bash
git clone git@github.com:medplum/medplum.git
```

If you get `Permission denied` error using `ssh` refer [here](https://help.github.com/articles/error-permission-denied-publickey/)
or use `https` link as a fallback.

```sh
git clone https://github.com/medplum/medplum.git
```

That will create a complete copy of the project source code on your local machine.

Next, you probably want to build and run the project. There are two methods for running and developing locally:

1. [Dev on the host](./dev-on-host) including running Postgres and Redis on the host
2. [Dev on docker](./dev-on-docker) without running any services directly on the host
