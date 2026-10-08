// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError, badRequest } from '@medplum/core';
import type { Request } from 'express';

/**
 * The request header that carries a caller-supplied string to be included in Medplum's logs.
 *
 * Written in canonical casing so that it reads back to the caller in error messages. Look it up
 * with `req.header()`, which is case insensitive, rather than indexing `req.headers` directly.
 */
export const LOG_TAG_HEADER = 'X-Medplum-Log-Tag';

/**
 * Characters allowed in a log tag: printable ASCII.
 *
 * Control characters are excluded because this value is written to log output, where an embedded
 * ANSI escape sequence can manipulate an operator's terminal. Non-ASCII is excluded because HTTP
 * header values outside ASCII are not portably transmitted; callers with non-ASCII values should
 * encode them.
 *
 * The 128 character limit is a log volume bound: this string is attached to every log line the
 * request emits, so its cost is per-line multiplied by request rate.
 */
const SAFE_LOG_TAG_REGEX = /^[\x20-\x7E]{1,128}$/;

/**
 * Returns the caller-supplied log tag for an incoming request.
 *
 * The tag is opaque to Medplum: it is never parsed, resolved, or used to make a decision. Its only
 * effect is to appear as the `logTag` field on log lines emitted while serving the request.
 *
 * A single scalar rather than a set of caller-supplied fields is deliberate. Log metadata is
 * merged flat into each log line, so an object here would let a caller shadow server-recorded
 * fields such as `profile`, `projectId`, or `requestId` in log output.
 *
 * An unusable value fails the request rather than being ignored or sanitized. A caller sets this
 * header precisely so that the value is available in the logs later, so silently dropping it would
 * turn a small mistake into missing data that is only discovered when someone goes looking for it.
 * Sanitizing is worse still: a partially stripped identifier no longer matches the caller's own
 * records but still looks like a valid tag.
 *
 * @param req - The incoming HTTP request.
 * @returns The log tag, or undefined if the request does not carry one.
 * @throws OperationOutcomeError if the header is present but not usable.
 */
export function getLogTag(req: Request): string | undefined {
  const value = req.header(LOG_TAG_HEADER);
  if (value === undefined) {
    return undefined;
  }

  if (!SAFE_LOG_TAG_REGEX.test(value)) {
    // The rejected value is deliberately left out of the message: it is unvalidated caller input,
    // and the response is echoed in logs and error trackers.
    throw new OperationOutcomeError(
      badRequest(`Invalid ${LOG_TAG_HEADER} header: expected 1 to 128 characters of printable ASCII`)
    );
  }

  return value;
}
