import {
  BotEvent,
  MedplumClient,
  createReference,
  getAllQuestionnaireAnswers,
  getReferenceString,
} from '@medplum/core';
import { AgentChannel, Bot, Endpoint, QuestionnaireResponse } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<void> {
  const response = event.input;
  const answers = getAllQuestionnaireAnswers(response);

  // Create an organization representing the remote site
  const organizationName = answers['organization-name']?.[0]?.valueString;
  if (!organizationName) {
    throw new Error('Missing organization name');
  }

  const organization = await medplum.upsertResource(
    {
      resourceType: 'Organization',
      name: organizationName,
    },
    { name: organizationName }
  );

  /* Inbound Communications */
  const endpoints = await Promise.all(
    answers['endpoint-name'].map((endpointName, index) => {
      const endpointAddress = answers['endpoint-ip']?.at(index)?.valueString;
      const endpointPort = answers['endpoint-port']?.at(index)?.valueInteger;
      const identifier = toIdentifier(endpointName.valueString ?? '');
      const endpoint: Endpoint = {
        resourceType: 'Endpoint',
        name: endpointName?.valueString,
        identifier: [
          {
            system: 'http://example.com',
            value: identifier,
          },
        ],
        status: 'active',
        managingOrganization: createReference(organization),
        connectionType: {
          system: 'http://terminology.hl7.org/CodeSystem/endpoint-connection-type',
          code: 'hl7v2-mllp',
          display: 'HL7 v2 MLLP',
        },
        payloadType: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/endpoint-payload-type',
                code: 'any',
                display: 'Any',
              },
            ],
          },
        ],
        address: `mllp://${endpointAddress}:${endpointPort}`,
      };
      return medplum.upsertResource(endpoint, {
        organization: getReferenceString(organization),
        identifier,
      });
    })
  );

  // Create a new Bot to listen on each agent channel
  const projectId = medplum.getProject()?.id;
  const bots = await Promise.all(
    endpoints.map(async (endpoint) => {
      return medplum.post(`/admin/projects/${projectId}/bot`, {
        name: `${organization.name}: ${endpoint.name} [Inbound]`,
      }) as Promise<Bot>;
    })
  );

  // Create the Agent resource, that represents the Medplum agent installed on-site
  const agentId = {
    system: 'http://example.com/agent-id',
    value: toIdentifier(organizationName) + '-agent',
  };
  const agent = await medplum.upsertResource(
    {
      resourceType: 'Agent',
      status: 'active',
      name: `${organization.name} Agent`,
      identifier: [agentId],
      channel: endpoints.map(
        (endpoint, index): AgentChannel => ({
          name: endpoint.name ?? '',
          endpoint: createReference(endpoint),
          targetReference: createReference(bots[index]),
        })
      ),
    },
    {
      identifier: `${agentId.system}|${agentId.value}`,
    }
  );

  // Create a ClientApplication to provide manage credentials for the on-site Agent
  await medplum.post(`admin/projects/${projectId}/client`, {
    name: `${agent.name} Client`,
    description: `Client ID/Secret for ${agent.name}`,
  });

  /* Outbound Communication */
  // Set up Device resources for remote devices (e.g. remote EMR, LIS, or RIS systems)
  await Promise.all(
    answers['device-name'].map((deviceName, index) => {
      const ip = answers['device-address']?.at(index)?.valueString;
      const port = answers['device-port']?.at(index)?.valueInteger;
      const deviceId = `${toIdentifier(organizationName)}-${toIdentifier(deviceName.valueString ?? '')}`;
      return medplum.upsertResource(
        {
          resourceType: 'Device',
          identifier: [{ system: 'http://example.com/device-id', value: deviceId }],
          deviceName: [{ name: deviceName.valueString ?? '', type: 'user-friendly-name' }],
          url: `mllp://${ip}:${port}`,
        },
        { identifier: deviceId }
      );
    })
  );

  // Create a placeholder Bot to handle outbound communications
  await medplum.post(`/admin/projects/${projectId}/bot`, {
    name: `${organization.name} [Outbound]`,
  });
}

function toIdentifier(s: string): string {
  return s.toLowerCase().replaceAll(/(\s+|\.+)/g, '-');
}
