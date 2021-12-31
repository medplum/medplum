import clsx from 'clsx';
import React from 'react';
import styles from './HomepageFeatures.module.css';

type FeatureItem = {
  title: string;
  image: string;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Easy to Use',
    image: '/img/undraw_docusaurus_mountain.svg',
    description: (
      <>Medplum was designed from the ground up to let you build your healthcare app quickly and compliantly.</>
    ),
  },
  {
    title: 'Focus on What Matters',
    image: '/img/undraw_docusaurus_tree.svg',
    description: (
      <>
        Medplum lets you focus on your app, and we&apos;ll do the chores. Focus on your clinical scenarios and let us
        handle the infrastructure and compliance.
      </>
    ),
  },
  {
    title: 'Powered by FHIR',
    image: '/img/undraw_docusaurus_react.svg',
    description: <>Data is stored natively in FHIR. Deploy in your own environment or use our hosted service.</>,
  },
];

function Feature({ title, image, description }: FeatureItem): JSX.Element {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <img className={styles.featureSvg} alt={title} src={image} />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
