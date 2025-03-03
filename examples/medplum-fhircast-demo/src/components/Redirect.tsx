import { useNavigate } from 'react-router';

type RedirectProps = {
  readonly path: string;
};

export default function Redirect(props: RedirectProps): null {
  const navigate = useNavigate();
  void navigate(props.path);
  return null;
}
