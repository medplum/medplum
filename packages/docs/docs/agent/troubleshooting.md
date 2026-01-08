---
sidebar_position: 100
---

# Troubleshooting

## Issue

- Agent Logs display `Token Expired` and service will not run. The log will state `[DEBUG] stderr: "Error: Token expired"`

- This error relates to the Authentication Token timing of when the Token was issued and when it is being used. It is best to check the system clock on the system where the Agent is installed. Ensure that the clock skew is no greater than 1 minute. Adjusting the system time and trying to restart, a new token will be issued.

## Log Level

To adjust the Agent log level, the `agent.properties` located within `C:\Program Files\Medplum Agent`, needs changed to reflect the desired level. The default logLevel is `INFO`, to increase the logging out add the `logLevel` key with the level as below
```
logLevel=DEBUG
```

Once the `agent.properties` is changed, the Windows Service `Medplum Agent` must be restarted for the changes take effect.

The log will show an output denoting the set level - that is embedded within the JSON structure after the `level` property.
```
2024-10-29 16:52:56 [DEBUG] stdout: "{\"level\":\"DEBUG\", ...
```

To set the logLevel back to the default, remove the `logLevel` key from the `agent.properties` file and restart the Windows Service.

For more detailed configuration options, see the [Configuration](./configuration) page.
