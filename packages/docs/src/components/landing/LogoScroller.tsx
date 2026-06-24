import { JSX } from 'react';
import styles from './LogoScroller.module.css';

export function LogoScroller(): JSX.Element {
  return (
    <div className={styles.logoScroller}>
      <div className={styles.images}>
        <Logos />
        <Logos />
      </div>
    </div>
  );
}

function Logos(): JSX.Element {
  return (
    <>
      <img src="/img/logos/ro.svg" width={49} height={28} alt="Ro" />
      <img src="/img/logos/rad-ai.svg" width={128} height={38} alt="Rad AI" />
      <img src="/img/logos/summer-health.svg" width={208} height={22} alt="Summer Health" />
      <img src="/img/logos/flexpa.svg" width={120} height={40} alt="Flexpa" />
      <img src="/img/logos/thirty-madison.webp" width={81} height={48} alt="Thirty Madison" />
      <img src="/img/logos/tia.svg" width={146} height={28} alt="Tia" />
      <img src="/img/logos/color.svg" width={89} height={29} alt="Color" />
      <img src="/img/logos/seen-health.svg" width={116} height={38} alt="Seen Health" />
      <img src="/img/logos/quilted-health.svg" width={75} height={86} alt="Quilted Health" />
      <img src="/img/logos/cdc.svg" width={65} height={51} alt="CDC" />
      <img src="/img/logos/remo.svg" width={87} height={24} alt="Remo" />
      <img src="/img/logos/imagine.svg" width={119} height={51} alt="Imagine Pediatrics" />
    </>
  );
}
