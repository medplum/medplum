---
sidebar_position: 10
---

# Clone the repo

Ah, you're ready to get your hands dirty, eh?  Great!  Let's get you setup with a cloned repo.

Medplum uses [git](https://git-scm.com/), which is a pretty popular version control system.  This document assumes basic familiarity with git, and that you have it installed on your system.

To clone the repo, run the following command:

```bash
git clone git@github.com:medplum/medplum.git
```

That will create a complete copy of the project source code on your local machine.

Next, you probably want to build and run the project.  There are two methods for running and developing locally:

1. [Dev on the host](./dev-on-host) including running Postgres and Redis on the host
2. [Dev on docker](./dev-on-docker) without running any services directly on the host

Which one should you choose?

The core development team all uses option 1, dev on the host, as it provides more control, better debugging, and better runtime performance.

If you are just getting started, and want to experiment quickly, then using Docker will get you up and running faster.
