import { Container } from '../Container/Container';
import { Panel, PanelProps } from '../Panel/Panel';

export function Document(props: PanelProps): JSX.Element {
  const { children, ...others } = props;
  return (
    <Container>
      <Panel {...others}>{children}</Panel>
    </Container>
  );
}
