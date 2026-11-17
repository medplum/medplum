// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ScriptSureReportWidget } from '@medplum/scriptsure-react';

export interface ScriptSureReportWidgetOption {
  readonly widget: ScriptSureReportWidget;
  /** Menu item and tab label. */
  readonly label: string;
  /** Modal and iframe title. */
  readonly title: string;
}

export const SCRIPTSURE_REPORT_WIDGETS: readonly ScriptSureReportWidgetOption[] = [
  { widget: 'auditlog', label: 'Audit log', title: 'ScriptSure audit log' },
  { widget: 'report', label: 'Reports', title: 'ScriptSure reports' },
];

export function isScriptSureReportWidget(value: string | null): value is ScriptSureReportWidget {
  return SCRIPTSURE_REPORT_WIDGETS.some((w) => w.widget === value);
}

export function getScriptSureReportWidget(widget: ScriptSureReportWidget): ScriptSureReportWidgetOption {
  return SCRIPTSURE_REPORT_WIDGETS.find((w) => w.widget === widget) ?? SCRIPTSURE_REPORT_WIDGETS[0];
}
