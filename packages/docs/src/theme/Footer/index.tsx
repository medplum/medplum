// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { ThemeClassNames, useThemeConfig } from '@docusaurus/theme-common';
import { FooterColumnItem } from '@docusaurus/theme-common/lib/utils/useThemeConfig';
import clsx from 'clsx';
import { memo, ReactNode } from 'react';
import LogoSvg from '../logo.svg';
import styles from './styles.module.css';

function Footer(): ReactNode {
  const { footer } = useThemeConfig();
  const { copyright, links } = footer;
  const columns = links as FooterColumnItem[];
  return (
    <footer className={clsx(ThemeClassNames.layout.footer.container, styles.footer, 'footer')}>
      <div className={styles.footerInner}>
        <div className={styles.row}>
          <div className={styles.column}>
            <LogoSvg width="159" height="34" className={styles.logoImage} style={{ marginBottom: '3rem' }} />
          </div>
          <div className={styles.column}>
            <div className={styles.row}>
              {columns.map((column, i) => (
                <div key={i} className={styles.column}>
                  <div className="footer__title">{column.title}</div>
                  <ul className="footer__items clean-list">
                    {column.items.map((item) => (
                      <li key={item.href ?? item.to} className="footer__item">
                        <Link className={styles.link} to={item.to}>
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
        <hr className={styles.separator} />
        <div className={styles.row}>
          <div className={styles.column}>
            <Link className={styles.bottomLink} to="/security">
              Security
            </Link>
            <Link className={styles.bottomLink} to="/terms">
              Terms of Service
            </Link>
            <Link className={styles.bottomLink} to="/privacy">
              Privacy Policy
            </Link>
          </div>
          <div className={clsx(styles.column, styles.rightAligned)}>{copyright}</div>
        </div>
      </div>
    </footer>
  );
}

export default memo(Footer);
