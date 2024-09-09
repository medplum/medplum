# Running the Medplum Docker Container

Medplum provides a Docker image, called [medplum/medplum-server](https://hub.docker.com/r/medplum/medplum-server). This image is mainly used to [install Medplum on AWS](/docs/self-hosting/install-on-aws), however it can also be run independently of AWS.

Prior to using this container, you will need to ensure that Docker is installed and running on your machine.

To run the Medplum Server docker image, you will first need to pull the container.

```bash
docker pull medplum/medplum-server
```

Once you have pulled the container, you can run it.

```bash
docker run medplum/medplum-server <CONFIG-PATH>
```

The container takes only one argument, the path to the config settings. The prefix of this path determines the source of the config:

- `file:/path/to/config.json`: Read from a config file.
- `aws:/parameter/store/prefix/`: Read from the [AWS Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html), using the entries that start with `prefix`.
