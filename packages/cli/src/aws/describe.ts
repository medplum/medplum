import { getStackByTag, printStackDetails, printStackNotFound } from './utils';

/**
 * The AWS "describe" command prints details about a Medplum CloudFormation stack.
 * @param tag - The Medplum stack tag.
 */
export async function describeStacksCommand(tag: string): Promise<void> {
  const details = await getStackByTag(tag);
  if (!details) {
    await printStackNotFound(tag);
    throw new Error(`Stack not found: ${tag}`);
  }
  printStackDetails(details);
}
