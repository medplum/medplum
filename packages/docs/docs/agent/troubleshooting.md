---
sidebar_position: 100
---

# Troubleshooting

## Issue

- Agent Logs display `Token Expired` and service will not run. The log will state `[DEBUG] stderr: "Error: Token expired"`

- This error relates to the Authentication Token timing of when the Token was issued and when it is being used. It is best to check the system clock on the system where the Agent is installed. Ensure that the clock skew is no greater than 1 minute. Adjusting the system time and trying to restart, a new token will be issued.
