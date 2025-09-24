---
sidebar_position: 7
---

# Agent CLI Commands

The Medplum CLI provides several commands for managing and interacting with agents. This document describes the available commands and their usage. See more about installing and using the Medplum CLI [here](/docs/cli). 

## Status Command

Get the status of one or more agents.

```bash
medplum agent status [agentIds...] [options]
```

### Arguments
- `[agentIds...]`: List of agent IDs to get status for. Either this or `--criteria` must be provided.

### Options
- `--criteria <criteria>`: FHIR search criteria to find agents (mutually exclusive with agentIds)
- `--output <format>`: Output format (table or json, defaults to table)

### Example
```bash
# Get status for specific agents
medplum agent status 123e4567-e89b-12d3-a456-426614174000 123e4567-e89b-12d3-a456-426614174001

# Get status using search criteria
medplum agent status --criteria "Agent?name=Test Agent"

# Get status in JSON format
medplum agent status --criteria "Agent?name=Test Agent" --output json
```

## Ping Command

Ping a host from a specified agent.

```bash
medplum agent ping <ipOrDomain> <agentId> [options]
```

### Arguments
- `<ipOrDomain>`: The IPv4 address or domain name to ping
- `<agentId>`: ID of the agent to ping from. Either this or `--criteria` must be provided.

### Options
- `--count <count>`: Number of pings to issue (default: 1)
- `--criteria <criteria>`: FHIR search criteria to find the agent (mutually exclusive with agentId)

### Example
```bash
# Ping using specific agent
medplum agent ping example.com 123e4567-e89b-12d3-a456-426614174000

# Ping using search criteria
medplum agent ping example.com --criteria "Agent?name=Test Agent"

# Ping multiple times
medplum agent ping example.com --criteria "Agent?name=Test Agent" --count 5
```

## Push Command

Push a message to a target device via a specified agent.

```bash
medplum agent push <deviceId> <message> <agentId> [options]
```

### Arguments
- `<deviceId>`: The ID of the device to push the message to
- `<message>`: The message to send to the destination device
- `<agentId>`: ID of the agent to send the message from. Either this or `--criteria` must be provided.

### Options
- `--content-type <contentType>`: The content type of the message (default: HL7_V2)
- `--no-wait`: Don't wait for a response from the destination device
- `--criteria <criteria>`: FHIR search criteria to find the agent (mutually exclusive with agentId)

### Example
```bash
# Push message using specific agent
medplum agent push device123 "Hello World" 123e4567-e89b-12d3-a456-426614174000

# Push message using search criteria
medplum agent push device123 "Hello World" --criteria "Agent?name=Test Agent"

# Push message without waiting for response
medplum agent push device123 "Hello World" --criteria "Agent?name=Test Agent" --no-wait
```

## Reload Config Command

Reload the configuration for one or more agents.

```bash
medplum agent reload-config [agentIds...] [options]
```

### Arguments
- `[agentIds...]`: List of agent IDs to reload config for. Either this or `--criteria` must be provided.

### Options
- `--criteria <criteria>`: FHIR search criteria to find agents (mutually exclusive with agentIds)
- `--output <format>`: Output format (table or json, defaults to table)

### Example
```bash
# Reload config for specific agents
medplum agent reload-config 123e4567-e89b-12d3-a456-426614174000 123e4567-e89b-12d3-a456-426614174001

# Reload config using search criteria
medplum agent reload-config --criteria "Agent?name=Test Agent"
```

## Upgrade Command

Upgrade the version for one or more agents.

```bash
medplum agent upgrade [agentIds...] [options]
```

### Arguments
- `[agentIds...]`: List of agent IDs to upgrade. Either this or `--criteria` must be provided.

### Options
- `--criteria <criteria>`: FHIR search criteria to find agents (mutually exclusive with agentIds)
- `--version <version>`: Version to upgrade to (defaults to latest version)
- `--output <format>`: Output format (table or json, defaults to table)

### Example
```bash
# Upgrade specific agents to latest version
medplum agent upgrade 123e4567-e89b-12d3-a456-426614174000 123e4567-e89b-12d3-a456-426614174001

# Upgrade using search criteria
medplum agent upgrade --criteria "Agent?name=Test Agent"

# Upgrade to specific version
medplum agent upgrade --criteria "Agent?name=Test Agent" --version 1.2.3
```

## Common Options

All commands support the following common options:

- `--fhir-url <url>`: FHIR server URL
- `--client-id <id>`: OAuth client ID
- `--client-secret <secret>`: OAuth client secret
- `--access-token <token>`: Access token for authentication

## Error Handling

The CLI provides detailed error messages when operations fail. Common error scenarios include:

- Invalid agent IDs or search criteria
- Network connectivity issues
- Authentication failures
- Agent not found
- Operation timeouts

When using the `--output json` option, errors are returned in a structured format that can be parsed programmatically.