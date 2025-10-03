---
sidebar_position: 3
---

# Agent-Side Configuration

This guide covers all local configuration options for the Medplum Agent, including how to configure the agent via command line arguments and the `agent.properties` file.

## Configuration Parameters

The Medplum Agent requires four essential parameters to connect to your Medplum server:

| Parameter      | Description                                                   | Required |
| -------------- | ------------------------------------------------------------- | -------- |
| `baseUrl`      | The Medplum server base URL (e.g., `https://api.medplum.com`) | Yes      |
| `clientId`     | The OAuth client ID from your ClientApplication               | Yes      |
| `clientSecret` | The OAuth client secret from your ClientApplication           | Yes      |
| `agentId`      | The UUID of your Agent resource                               | Yes      |

### Optional Parameters

| Parameter          | Description                                                                              | Default |
| ------------------ | ---------------------------------------------------------------------------------------- | ------- |
| `logLevel`         | Global log level for both main and channel loggers                                       | `INFO`  |
| `logger.main.*`    | Configuration for the main logger (see [Logger Configuration](#logger-configuration))    | -       |
| `logger.channel.*` | Configuration for the channel logger (see [Logger Configuration](#logger-configuration)) | -       |

## Configuration Methods

There are two ways to configure the Medplum Agent: via command line arguments or using an `agent.properties` file.

### Command Line Arguments

When running the agent from the command line, provide the required parameters as arguments:

```bash
npm run agent <baseUrl> <clientId> <clientSecret> <agentId> [logLevel]
```

**Example:**

```bash
npm run agent https://api.medplum.com my-client-id my-client-secret 123e4567-e89b-12d3-a456-426614174000
```

**Example with log level:**

```bash
npm run agent https://api.medplum.com my-client-id my-client-secret 123e4567-e89b-12d3-a456-426614174000 DEBUG
```

**Limitations:**

- Command line arguments only support the four required parameters plus an optional global `logLevel`
- The command-line `logLevel` sets the same log level for both main and channel loggers
- Advanced logger configuration (separate log directories, file rotation, etc.) is only available via the `agent.properties` file

### Environment Variable Configuration

When running the agent in Docker or other containerized environments, you can use the `MEDPLUM_LOG_LEVEL` environment variable to set the global log level:

```bash
docker run -e MEDPLUM_LOG_LEVEL="DEBUG" \
  -e MEDPLUM_BASE_URL="https://api.medplum.com" \
  -e MEDPLUM_CLIENT_ID="my-client-id" \
  -e MEDPLUM_CLIENT_SECRET="my-client-secret" \
  -e MEDPLUM_AGENT_ID="123e4567-e89b-12d3-a456-426614174000" \
  medplum/medplum-agent:latest
```

**Note:** Like command-line arguments, the `MEDPLUM_LOG_LEVEL` environment variable sets the same log level for both main and channel loggers. For granular control over individual logger settings, use the `agent.properties` file.

### Properties File Configuration

The `agent.properties` file provides full access to all configuration options, including advanced logger settings.

#### File Location

- **Windows**: `C:\Program Files\Medplum Agent\agent.properties`
- **Linux/macOS**: In the directory where the agent is installed (typically the same directory as the agent executable)

#### File Format

The properties file uses a simple `key=value` format with one setting per line:

```properties
baseUrl=https://api.medplum.com
clientId=my-client-id
clientSecret=my-client-secret
agentId=123e4567-e89b-12d3-a456-426614174000
```

#### Setting Global Log Level

To set the same log level for both main and channel loggers, use the `logLevel` parameter in `agent.properties`:

```properties
logLevel=DEBUG
```

This is equivalent to setting both `logger.main.logLevel=DEBUG` and `logger.channel.logLevel=DEBUG`.

**Note:** The `logLevel` parameter in `agent.properties` works the same way as:

- The optional 5th command-line argument when running the agent directly
- The `MEDPLUM_LOG_LEVEL` environment variable when running in Docker

If you need different log levels for the main and channel loggers, or want to configure other logger properties (directories, rotation, etc.), use the detailed logger configuration syntax described in the [Logger Configuration](#logger-configuration) section below.

#### Applying Configuration Changes

After modifying `agent.properties`, restart the agent service for changes to take effect:

- **Windows**: Restart the "Medplum Agent" service from the Services Manager
- **CLI/Source**: Stop and restart the agent process

## Logger Configuration

The Medplum Agent uses two separate, independently configurable loggers to provide fine-grained control over logging and to protect patient privacy.

### Main Logger vs. Channel Logger

#### Main Logger

The **main logger** records general agent activity, including:

- Agent startup and shutdown events
- Connection status to the Medplum server
- Configuration warnings and errors
- General system exceptions
- Agent lifecycle events

**Important:** The main logger does **not** contain Protected Health Information (PHI).

#### Channel Logger

The **channel logger** records activity specific to individual communication channels, including:

- HL7 message content and processing
- DICOM study transfers
- ASTM result messages
- Channel-specific errors and warnings
- Message routing and transformation

**Important:** The channel logger **may contain PHI** as it logs the actual content of messages being transmitted.

### Why Separate Loggers?

The separation between main and channel loggers serves an important security purpose: it enables **remote log fetching without unnecessarily exposing PHI**.

When troubleshooting connection issues or agent configuration problems, administrators can fetch main logger entries to diagnose the issue via the [Fetch Logs FHIR operation](./fetch-logs.md), without accessing any patient data.

Channel logs, which may contain PHI, can be kept with stricter access controls and only accessed when specifically needed for message-level debugging.

### Logger Configuration Properties

Each logger (main and channel) supports the following configuration properties:

| Property        | Type    | Default         | Description                                                      |
| --------------- | ------- | --------------- | ---------------------------------------------------------------- |
| `logLevel`      | string  | `INFO`          | Log verbosity level: `NONE`, `ERROR`, `WARN`, `INFO`, or `DEBUG` |
| `logDir`        | string  | Agent directory | Directory path where log files are stored                        |
| `maxFileSizeMb` | integer | `10`            | Maximum log file size in megabytes before rotation               |
| `filesToKeep`   | integer | `10`            | Number of rotated log files to retain                            |

### Configuration Syntax

To configure a logger property, use the format:

```
logger.<type>.<property>=<value>
```

Where:

- `<type>` is either `main` or `channel`
- `<property>` is one of: `logLevel`, `logDir`, `maxFileSizeMb`, `filesToKeep`
- `<value>` is the desired setting

### Configuration Examples

#### Example 1: Different Log Levels

Set the main logger to `INFO` and increase the channel logger to `DEBUG` for detailed message debugging:

```properties
logger.main.logLevel=INFO
logger.channel.logLevel=DEBUG
```

#### Example 2: Separate Log Directories

Store main and channel logs in separate directories for easier management and access control:

**Linux/macOS:**

```properties
logger.main.logDir=/var/log/medplum-agent
logger.channel.logDir=/var/log/medplum-agent/channels
```

**Windows:**

```properties
logger.main.logDir=C:\Logs\MedplumAgent
logger.channel.logDir=C:\Logs\MedplumAgent\Channels
```

#### Example 3: Different Retention Policies

Keep more channel logs for compliance, but limit main logs to conserve space:

```properties
logger.main.maxFileSizeMb=10
logger.main.filesToKeep=5
logger.channel.maxFileSizeMb=50
logger.channel.filesToKeep=30
```

#### Example 4: Production Configuration

A production configuration that separates PHI-containing logs to a separate directory:

```properties
baseUrl=https://api.medplum.com
clientId=production-client-id
clientSecret=production-client-secret
agentId=production-agent-id

# Main logger: INFO level, moderate retention
logger.main.logLevel=INFO
logger.main.logDir=/var/log/medplum/main
logger.main.maxFileSizeMb=10
logger.main.filesToKeep=10

# Channel logger: WARN level (only warnings and errors), extended retention
logger.channel.logLevel=INFO
logger.channel.logDir=/var/log/medplum/channels
logger.channel.maxFileSizeMb=20
logger.channel.filesToKeep=60
```

### Log File Names

Logs are written to daily-rotated files with the following naming conventions:

- **Main logger**: `medplum-agent-main-YYYY-MM-DD.log`
- **Channel logger**: `medplum-agent-channels-YYYY-MM-DD.log`

Where `YYYY-MM-DD` is the date the log file was created.

**Example file names:**

```
medplum-agent-main-2024-10-02.log
medplum-agent-main-2024-10-03.log
medplum-agent-channels-2024-10-02.log
medplum-agent-channels-2024-10-03.log
```

### Verifying Logger Configuration

After restarting the agent, you can verify the log level is set correctly by examining the log output. Each log entry includes a `level` field in the JSON structure:

```json
{ "level": "INFO", "msg": "Successfully connected to Medplum server", "timestamp": "2024-10-02T16:52:56.789Z" }
```

For `DEBUG` level logging, you'll see more verbose output:

```json
{ "level": "DEBUG", "msg": "Received from WebSocket: ...", "timestamp": "2025-10-02T22:43:40.760Z" }
```

### Resetting to Defaults

To reset logger configuration to defaults, remove the corresponding properties from `agent.properties` and restart the agent service.

**Default values:**

- `logLevel`: `INFO`
- `logDir`: Agent installation directory
- `maxFileSizeMb`: `10`
- `filesToKeep`: `10`

## Best Practices

### Security Considerations

1. **Protect PHI**: Store channel logs in a secure location with appropriate access controls since they may contain PHI
2. **Separate Storage**: Consider storing main and channel logs on different volumes or with different backup policies
3. **Access Control**: Limit access to channel logs to only those who need to troubleshoot message-level issues
4. **Secure Credentials**: Never commit `agent.properties` containing real credentials to version control

### Performance Considerations

1. **Log Level**: Use `INFO` or `WARN` in production; reserve `DEBUG` for troubleshooting
2. **File Size**: Larger `maxFileSizeMb` values reduce rotation frequency but increase memory usage during log queries and decrease logging performance. For more retention, consider increasing `filesToKeep` over `maxFileSizeMb`
3. **Retention**: Balance compliance requirements with disk space
4. **Disk Space**: Monitor log directory disk usage, especially for high-volume channel logging when `filesToKeep` and `maxFileSizeMb` are high

### Operational Recommendations

1. **Monitor Logs**: Regularly review main logger for connection issues and configuration warnings
2. **Rotation**: Ensure log rotation is working by checking for dated log files
3. **Testing**: Test configuration changes in a non-production environment first
