import { Bot, ClientApplication } from '@medplum/fhirtypes';

export const ExampleBot: Bot = {
  resourceType: 'Bot',
  id: '123',
  name: 'Test Bot',
  code: 'console.log("hello world");',
};

export const ExampleClient: ClientApplication = {
  resourceType: 'ClientApplication',
  id: '123',
  name: 'Test Client',
};
