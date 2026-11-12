// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ScriptSureReportWidget } from '@medplum/scriptsure-react';

export const SCRIPTSURE_REPORT_WIDGETS: readonly { widget: ScriptSureReportWidget; label: string }[] = [
  { widget: 'auditlog', label: 'Audit log' },
  { widget: 'report', label: 'Reports' },
];

export function isScriptSureReportWidget(value: string | null): value is ScriptSureReportWidget {
  return SCRIPTSURE_REPORT_WIDGETS.some((w) => w.widget === value);
}
