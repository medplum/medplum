import { useNavigate } from 'react-router-dom';

type RedirectProps = {
  readonly path: string;
};

export default function Redirect(props: RedirectProps): null {
  const navigate = useNavigate();
  navigate(props.path);
  return null;
}
