// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconBrandTwitterFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import styles from './TestimonialHeader.module.css';

export interface TestimonialHeaderProps {
  readonly imgSrc: string;
  readonly name: string;
  readonly title?: string;
  readonly twitter?: string;
}

export function TestimonialHeader(props: TestimonialHeaderProps): JSX.Element {
  return (
    <div className={styles.testimonialHeader}>
      <img src={props.imgSrc} loading="lazy" alt={props.name} />
      <div className={styles.testimonialInfo}>
        <div className={styles.testimonialName}>{props.name}</div>
        <div className={styles.testimonialTitle}>{props.title}</div>
      </div>
      {props.twitter && (
        <Link href={props.twitter} className={styles.testimonialLink}>
          <IconBrandTwitterFilled className={styles.twitterIcon} />
        </Link>
      )}
    </div>
  );
}
