import GitHubSvg from './github.svg';
import LinkedInSvg from './linkedin.svg';
import styles from './ProfileCard.module.css';

export interface ProfileCardProps {
  name: string;
  title: string;
  imgUrl: string;
  linkedInUrl: string;
  githubUrl: string;
}

export function ProfileCard(props: ProfileCardProps): JSX.Element {
  return (
    <div className={styles.profileCard}>
      <div className={styles.profileImage}>
        <img src={props.imgUrl} alt={props.name} />
      </div>
      <h3>{props.name}</h3>
      <p>{props.title}</p>
      <div className={styles.profileLinks}>
        <a href={props.linkedInUrl} target="_blank" className={styles.profileLink}>
          <LinkedInSvg />
          <div>LinkedIn</div>
        </a>
        <a href={props.githubUrl} target="_blank" className={styles.profileLink}>
          <GitHubSvg />
          <div>GitHub</div>
        </a>
      </div>
    </div>
  );
}
