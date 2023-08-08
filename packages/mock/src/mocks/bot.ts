import { Binary, Bot, ClientApplication } from '@medplum/fhirtypes';

export const ExampleBotSourceCode: Binary = {
  resourceType: 'Binary',
  id: 'bot-source-code',
  contentType: 'application/javascript',
};

export const ExampleBot: Bot = {
  resourceType: 'Bot',
  id: '123',
  name: 'Test Bot',
  sourceCode: {
    contentType: 'application/javascript',
    title: 'index.js',
    url: 'Binary/bot-source-code',
  },
};

export const ExampleClient: ClientApplication = {
  resourceType: 'ClientApplication',
  id: '123',
  name: 'Test Client',
};
