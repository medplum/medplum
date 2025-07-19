import { type ReactNode } from 'react';
import LogoSvg from '../../logo.svg';
import styles from './styles.module.css';

export default function NavbarLogo(): ReactNode {
  return (
    <div className={styles.logoContainer}>
      <a className="navbar__brand" href="/">
        <LogoSvg height="30" width="138" className={styles.logoImage} />
      </a>
    </div>
  );
}
