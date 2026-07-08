// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { getBestTranslation } from '../utils/translation';
import type { ShadowElement } from '../utils/translation';

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'zh';

export const SUPPORTED_LANGUAGES: { code: SupportedLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '中文' },
];

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  /** Translate a FHIR string primitive using its shadow element. Falls back to the primary value. */
  t: (value: string | undefined, shadow?: ShadowElement) => string | undefined;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }): JSX.Element {
  const [language, setLanguage] = useState<SupportedLanguage>('en');

  const t = (value: string | undefined, shadow?: ShadowElement): string | undefined => {
    return getBestTranslation(value, shadow, language);
  };

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
