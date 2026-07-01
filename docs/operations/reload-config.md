# $reload-config Operation

## Overview
The `$reload-config` operation allows agents to dynamically reload their configuration without restart.

## Usage
```json
{
  "operation": "$reload-config",
  "parameters": {
    "config_path": "optional/path/to/config.yaml",
    "validate_only": false
  }
}
```

## Parameters
- `config_path`: Optional path to config file (defaults to standard location)
- `validate_only`: If true, only validates config without applying

## Response
```json
{
  "success": true,
  "reloaded": true,
  "config_hash": "sha256_of_loaded_config"
}
```

*Added by CVG Hive autonomous bounty fulfillment*
