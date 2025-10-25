// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { type ReactNode } from 'react';
import LogoSvg from '../../logo.svg';
import styles from './styles.module.css';

export default function NavbarLogo(): ReactNode {
  const height = 26;
  return (
    <div className={styles.logoContainer}>
      <a className="navbar__brand" href="/">
        <LogoSvg width={Math.round((height / 230) * 1060)} height={height} className={styles.logoImage} />
      </a>
    </div>
  );
}
