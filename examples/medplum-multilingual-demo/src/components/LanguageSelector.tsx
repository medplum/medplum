// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SegmentedControl } from '@mantine/core';
import type { JSX } from 'react';
import { SUPPORTED_LANGUAGES, useLanguage } from '../context/LanguageContext';
import type { SupportedLanguage } from '../context/LanguageContext';

export function LanguageSelector(): JSX.Element {
  const { language, setLanguage } = useLanguage();

  return (
    <SegmentedControl
      value={language}
      onChange={(val) => setLanguage(val as SupportedLanguage)}
      data={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
      size="sm"
    />
  );
}
