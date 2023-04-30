import { getAllStacks, getStackDetails, printStackDetails } from './utils';

/**
 * The AWS "list" command prints summary details about all Medplum CloudFormation stacks.
 */
export async function listStacksCommand(): Promise<void> {
  const stackSummaries = await getAllStacks();
  for (const stackSummary of stackSummaries) {
    const stackName = stackSummary.StackName;
    const details = await getStackDetails(stackName);
    if (!details) {
      continue;
    }
    printStackDetails(details);
    console.log('');
  }
}
