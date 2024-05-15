## Agent Setup Tools

**Note:** These tools will be dependent on functionality released in Medplum version 3.1.6

This folder contains a set of tools to onboard remote sites to Medplum using the [Medplum Agent](https://www.medplum.com/docs/agent). It consists of a Questionnaire / Bot combination that creates all the necessary resources for bi-directional communication:

- `Organization` to model the remote site
- `Agent` to configure and test the onsite [Agent](https://www.medplum.com/docs/agent)
- `Endpoint` resources for inbound communication channels, plus `Bots` to handle inbound traffic
- `Device` resources to represent remote devices (e.g. EMR, LIS, RIS/PACS) for outbound communication
- `ClientApplication` use to Authenticate the agent
- `Bot` resources to handle the inbound / outbound messages
  - One `Bot` per inbound channel
  - A single `Bot` to handle all outbound traffic


### Installing the tools
- Create a new `Questionnaire`resource using the provided [template questionnaire](./setup-medplum-agent.questionnaire.json)
- [Upload and deploy](https://www.medplum.com/docs/bots/bots-in-production) the [Setup Agent Bot](./setup-medplum-agent.ts)
- Connect the Questionnaire to the Bot via a [FHIR Subscription](https://www.medplum.com/docs/bots/bot-for-questionnaire-response)
- Grant the bot [Project Admin privileges](https://www.medplum.com/docs/auth/user-management-guide#promote-existing-user-to-admin)

