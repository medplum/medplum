---
sidebar_position: 30
---

# Dev on Docker

Follow these instructions to run the complete Medplum stack on Docker

## Prerequisites

1. Install [Docker](https://docs.docker.com/get-docker/)
2. [Clone the Medplum repo](./clone-the-repo)

## Docker Compose

Open a terminal.  Navigate to the Medplum repo directory.  For example:

```bash
cd ~/dev/medplum
```

Start the Docker containers with the following command:

```bash
docker-compose up
```

This kicks off a big chain of events.  In the end, there will be 4 running Docker containers
1. PostgreSQL database
2. Redis cache
3. Medplum back-end API server
4. Medplum front-end application

This might take a few minutes.

When `docker-compose` completes, you should see something like this in your terminal:

```bash
server_1    | INFO 2022-01-28T19:08:42.224Z Run database migrations
server_1    | INFO 2022-01-28T19:08:42.477Z No keys found.  Creating new key...
server_1    | INFO 2022-01-28T19:08:42.582Z Create user admin@example.com
server_1    | INFO 2022-01-28T19:08:42.639Z Created: 875bc82d-f5a3-49e3-bd36-c6aad1ba96cb
server_1    | INFO 2022-01-28T19:08:42.639Z Create project Medplum
server_1    | INFO 2022-01-28T19:08:42.650Z Created: 1bef07a1-b521-4130-9b33-884f90339ee8
server_1    | INFO 2022-01-28T19:08:42.651Z Create practitioner: Medplum Admin
server_1    | INFO 2022-01-28T19:08:42.671Z Created: 3cc2a03a-30c3-456f-9b3b-63c9b7b88caa
server_1    | INFO 2022-01-28T19:08:42.672Z Create project membership: Medplum
server_1    | INFO 2022-01-28T19:08:42.682Z Created: 93502aad-0b44-428d-b925-3b9b0fad5ad6
server_1    | INFO 2022-01-28T19:08:42.682Z Create default client Medplum
server_1    | INFO 2022-01-28T19:08:42.693Z Created: 301226d4-e139-408c-a61a-7bf06693515d
server_1    | INFO 2022-01-28T19:08:42.704Z Create Public project...
server_1    | INFO 2022-01-28T19:08:42.714Z Created: 52e4ac94-0f00-4f49-b1ed-469a8e8d78f2
```

Now you can open the Medplum app in your web browser at <http://localhost:3000>

The default email and password is:
* Email: admin@example.com
* Password: medplum_admin

From there, you can proceed to use the app.

## Tips

### It didn't work

Do you see any errors in the logs?

Is the API healtcheck available at <http://localhost:5000/healthcheck>?

Is it possible you already have PostgreSQL running on port 5432?

Is it possible you already have Redis running on port 6379?

Is it possible you already have a different project running on ports 3000 or 5000?

### Stop everything

To stop all Docker containers, run this command:

```bash
docker kill $(docker ps -q)
```

The `docker ps` command lists all containers.  The `docker kill` command stops those containers.

### Prune everything

If you get into a bad state, and want to wipe everything, you can use Docker `prune`:

```bash
docker system prune --all --volumes
```

This removes all containers, networks, images, and volumes.
