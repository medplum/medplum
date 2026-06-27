// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export const DEFAULT_IGNORED_PROPERTIES = ['meta', 'implicitRules', 'contained', 'extension', 'modifierExtension'];

// Ignored only when they are top-level properties
// e.g. Patient.language is ignored, but Patient.communication.language is not ignored
export const DEFAULT_IGNORED_NON_NESTED_PROPERTIES = ['language', 'text'];

// Extension URLs that are hidden from generic resource displays because they add noise without
// clinical value. Seeded with Synthea synthetic-data extensions, which are a common source of
// junk extensions. This list is intentionally conservative and can be extended.
export const DEFAULT_IGNORED_EXTENSION_URLS = [
  'http://synthetichealth.github.io/synthea/disability-adjusted-life-years',
  'http://synthetichealth.github.io/synthea/quality-adjusted-life-years',
];
