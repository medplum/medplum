// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Common state for async loading operations
 * @example
 * const [state, setState] = useState<LoadState>('loading');
 * if (state === 'loading') { return <Loader />; }
 * if (state === 'error') { return <ErrorMessage />; }
 * return <Data />;
 */
export type LoadState = 'loading' | 'loaded' | 'error';
