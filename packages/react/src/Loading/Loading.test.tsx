// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render } from '../test-utils/render';
import { Loading } from './Loading';

describe('Loading', () => {
  test('Renders', () => {
    const { container } = render(<Loading />);
    expect(container).toBeDefined();
    expect(container.querySelector('[class*="Loader"]')).toBeDefined();
  });
});
