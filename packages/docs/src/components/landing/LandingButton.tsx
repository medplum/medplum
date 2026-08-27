// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import type { JSX, ReactNode } from 'react';
import type { LandingButtonOptions, LandingButtonVariant } from './landingButtonClass';
import { landingButtonClass } from './landingButtonClass';

export interface LandingButtonProps extends LandingButtonOptions {
  readonly to: string;
  readonly variant: LandingButtonVariant;
  readonly children: ReactNode;
  readonly target?: string;
  readonly rel?: string;
}

/**
 * A marketing CTA button rendered as a link.
 *
 * @param props - The destination, treatment, label, and responsive opt-ins.
 * @returns The link element.
 */
export function LandingButton(props: LandingButtonProps): JSX.Element {
  const { to, variant, children, stretchMobile, ...rest } = props;
  return (
    <Link {...rest} to={to} className={landingButtonClass(variant, { stretchMobile })}>
      {children}
    </Link>
  );
}
