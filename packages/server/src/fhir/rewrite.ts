import { Binary, Resource } from '@medplum/fhirtypes';
import { getConfig } from '../config';
import { getLogger } from '../context';
import { Repository } from './repo';
import { getBinaryStorage } from './storage';

/**
 * The target type of the attachment rewrite.
 */
export enum RewriteMode {
  /**
   * Rewrite the attachment URL to a presigned URL.
   *
   * Attachment URLs are only rewritten if the provided repository
   * has access to the underlying Binary resource.  If not, then the
   * URL is left as is.
   *
   * Example: https://storage.medplum.com/binary/123/456?Signature=...
   */
  PRESIGNED_URL,

  /**
   * Rewrite the attachment URL to a canonical FHIR reference string.
   *
   * No access checks are performed.  The URL is always rewritten to reference form.
   *
   * Example: Binary/11feac5b-b5b7-4d5d-a416-0d64c194dac0
   */
  REFERENCE,
}

/**
 * Rewrites an object to replace any attachment references with signed URLs.
 *
 * Uses the repository to verify that the referenced resources exist and that
 * the current user has permission to read them.
 * @param mode - The mode to use when rewriting the attachments.
 * @param repo - The repository configured for the current user.
 * @param input - The input value (object, array, or primitive).
 * @returns The rewritten value.
 */
export async function rewriteAttachments<T>(mode: RewriteMode, repo: Repository, input: T): Promise<T> {
  return new Rewriter(mode, repo).rewriteValue(input);
}

/**
 * The Rewriter class rewrites attachments in a resource.
 * It uses an internal cache to assure that each attachment is only rewritten once.
 */
class Rewriter {
  readonly cache: Record<string, string> = {};

  constructor(
    private readonly mode: RewriteMode,
    private readonly repo: Repository
  ) {}

  /**
   * Rewrites an object to replace any attachment references with signed URLs.
   * @param input - The input value (object, array, or primitive).
   * @returns The rewritten value.
   */
  async rewriteValue<T>(input: T): Promise<T> {
    if (input === null || input === undefined) {
      return input;
    }

    if (Array.isArray(input)) {
      const result = [];
      for (const entry of input) {
        result.push(await this.rewriteValue(entry));
      }
      return result as unknown as T;
    }

    if (typeof input === 'object') {
      if ((input as unknown as Resource).resourceType === 'Binary') {
        // Be careful to never rewrite URLs within a Binary resource.
        // Even though Binary does not have a URL property,
        // it could have a url property within an extension or other nonstandard property.
        // Rewritting urls within a Binary could cause an infinite loop.
        return input;
      }

      const entries = [];
      for (const entry of Object.entries(input)) {
        entries.push(await this.rewriteProperty(entry));
      }
      return Object.fromEntries(entries) as unknown as T;
    }

    return input;
  }

  /**
   * Rewrites an object property.
   * @param keyValue - The key/value pair to rewrite.
   * @param keyValue."0" - The key.
   * @param keyValue."1" - The value.
   * @returns The rewritten key/value pair.
   */
  async rewriteProperty([key, value]: [string, any]): Promise<[string, any]> {
    const url = await this.rewriteAttachmentUrl([key, value]);
    if (url) {
      return [key, url];
    }

    return [key, await this.rewriteValue(value)];
  }

  /**
   * Tries to rewrite an attachment URL property.
   * If successful, returns the rewritten URL.
   * Otherwise, returns undefined.
   * @param keyValue - The key/value pair to rewrite.
   * @param keyValue."0" - The key.
   * @param keyValue."1" - The value.
   * @returns The rewritten URL or undefined.
   */
  async rewriteAttachmentUrl([key, value]: [string, any]): Promise<string | boolean | undefined> {
    if ((key !== 'url' && key !== 'path') || typeof value !== 'string') {
      // Not a URL property or not a string value.
      return undefined;
    }

    const { id, versionId } = normalizeBinaryUrl(value);
    if (!id) {
      // Not a binary URL.
      return value;
    }

    let result = this.cache[value];
    if (!result) {
      if (this.mode === RewriteMode.REFERENCE) {
        // Return the canononical reference string.
        result = `Binary/${id}`;
      } else {
        // Try to return the presigned URL
        result = await this.getAttachmentPresignedUrl(id, versionId);
      }
      this.cache[value] = result;
    }
    return result;
  }

  /**
   * Tries to generate a presigned URL for the binary.
   * @param id - The binary ID.
   * @param versionId - Optional binary version ID.
   * @returns The attachment presigned URL.
   */
  async getAttachmentPresignedUrl(id: string, versionId?: string): Promise<string> {
    let binary: Binary;
    try {
      if (versionId) {
        binary = await this.repo.readVersion<Binary>('Binary', id, versionId);
      } else {
        binary = await this.repo.readResource<Binary>('Binary', id);
      }
      if (binary.securityContext) {
        await this.repo.readReference(binary.securityContext);
      }
    } catch (err: any) {
      getLogger().debug('Error reading binary to generate presigned URL', err);
      return `Binary/${id}`;
    }

    return getBinaryStorage().getPresignedUrl(binary);
  }
}

/**
 * Normalizes a binary URL to a binary ID and version ID.
 *
 * There are multiple ways to represent a binary URL:
 *   1) FHIR reference (Binary/123)
 *   2) FHIR API URL (https://fhir.example.com/Binary/123)
 *   3) Presigned URL (https://storage.medplum.com/binary/123/456?Signature=...)
 *
 * When comparing two binary URLs, we want to compare the binary ID and version ID.
 * @param url - The input URL.
 * @returns The normalized binary ID and version ID.
 */
function normalizeBinaryUrl(url: string): { id?: string; versionId?: string } {
  const config = getConfig();
  let refStr: string | undefined;

  if (url.startsWith(config.baseUrl + 'fhir/R4/Binary/')) {
    refStr = url.substring(config.baseUrl.length + 'fhir/R4/Binary/'.length);
  } else if (url.startsWith(config.storageBaseUrl)) {
    refStr = url.substring(config.storageBaseUrl.length);
  } else if (url.startsWith('Binary/')) {
    refStr = url.substring('Binary/'.length);
  }

  if (refStr) {
    const parts = refStr.split('/');
    if (parts.length === 3 && parts[1] === '_history') {
      return { id: parts[0], versionId: parts[2] };
    }
    return { id: parts[0] };
  }

  return {};
}
