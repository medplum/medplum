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
      <img src="/img/logos/kit.webp" width={71} height={36} alt="Kit" />
      <img src="/img/logos/miga.webp" width={145} height={55} alt="Miga Health" />
      <img src="/img/logos/ro.webp" width={57} height={56} alt="Ro" />
      <img src="/img/logos/human-first.webp" width={219} height={30} alt="Human First" />
      <img src="/img/logos/cdc.webp" width={65} height={48} alt="CDC" />
      <img src="/img/logos/thirty-madison.webp" width={92} height={55} alt="Thirty Madison" />
      <img src="/img/logos/summer-health.webp" width={527} height={55} alt="Summer Health" />
      <img src="/img/logos/alley-corp.webp" width={45} height={51} alt="Alley Corp" />
      <img src="/img/logos/helpful.webp" width={133} height={36} alt="Helpful" />
      <img src="/img/logos/flexpa.webp" width={133} height={51} alt="Flexpa" />
      <img src="/img/logos/imagine.webp" width={96} height={51} alt="Imagine" />
      <img src="/img/logos/tia.webp" width={68} height={36} alt="Tia" />
    </>
  );
}
