// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { vi } from 'vitest';
import { SCRIPTSURE_IFRAME_BOT } from './common';
import { useScriptSureWidgetUrl } from './useScriptSureWidgetUrl';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('useScriptSureWidgetUrl', () => {
  test('requests the widget URL for the selected practice', async () => {
    const medplum = new MockClient();
    const executeBot = vi
      .spyOn(medplum, 'executeBot')
      .mockResolvedValue({ url: 'https://ssu.example/widgets/auditlog?sessiontoken=abc' });
    const { result } = renderHook(() => useScriptSureWidgetUrl(), { wrapper: wrapper(medplum) });

    await expect(result.current.getWidgetUrl('auditlog', { reference: 'Organization/org-1' })).resolves.toBe(
      'https://ssu.example/widgets/auditlog?sessiontoken=abc'
    );
    expect(executeBot).toHaveBeenCalledWith(SCRIPTSURE_IFRAME_BOT, { widget: 'auditlog', organizationId: 'org-1' });
  });

  test.each([undefined, {}, { url: 42 }])('rejects malformed bot response %#', async (response) => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(response);
    const { result } = renderHook(() => useScriptSureWidgetUrl(), { wrapper: wrapper(medplum) });

    await expect(result.current.getWidgetUrl('report')).rejects.toThrow('Invalid ScriptSure widget response');
  });
});
