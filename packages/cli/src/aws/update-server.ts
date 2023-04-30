import { UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { ecsClient, getEcsServiceName, getStackByTag } from './utils';

/**
 * The AWS "update-server" command updates the Medplum server in a Medplum CloudFormation stack.
 * @param tag The Medplum stack tag.
 * @returns
 */
export async function updateServerCommand(tag: string): Promise<void> {
  const details = await getStackByTag(tag);
  if (!details) {
    console.log('Stack not found');
    return;
  }
  const ecsCluster = details.ecsCluster?.PhysicalResourceId;
  if (!ecsCluster) {
    console.log('ECS Cluster not found');
    return;
  }
  const ecsService = getEcsServiceName(details.ecsService);
  if (!ecsService) {
    console.log('ECS Service not found');
    return;
  }
  await ecsClient.send(
    new UpdateServiceCommand({
      cluster: ecsCluster,
      service: ecsService,
      forceNewDeployment: true,
    })
  );
  console.log(`Service "${ecsService}" updated successfully.`);
}
