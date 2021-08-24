import React from 'react';
import { Popup } from './Popup';
import './SubMenu.css';

interface SubMenuProps {
  title: string;
}

interface SubMenuState {
  visible: boolean;
  x: number;
  y: number;
}

export class SubMenu extends React.Component<SubMenuProps, SubMenuState> {
  private menuItemRef: React.RefObject<HTMLDivElement>;
  private timerId?: number;
  private hover = false;

  constructor(props: SubMenuProps) {
    super(props);

    this.state = {
      visible: false,
      x: 0,
      y: 0
    };

    this.menuItemRef = React.createRef();
  }

  render() {
    return (
      <div
        ref={this.menuItemRef}
        className="medplum-menu-item medplum-submenu-item"
        onClick={() => this.handleClick()}
        onMouseOver={() => this.handleMouseOver()}
        onMouseLeave={() => this.handleMouseLeave()}>
        {this.props.title}
        <span className="medplum-submenu-arrow" style={{ userSelect: 'none' }}>{'\u25BA'}</span>
        <Popup
          visible={this.state.visible}
          x={this.state.x}
          y={this.state.y}
          autoClose={true}
          onClose={() => this.setState({ visible: false })}>
          {this.props.children}
        </Popup>
      </div>
    );
  }

  componentDidMount() {
    this.timerId = window.setInterval(() => this.handleTick(), 150);
  }

  componentWillUnmount() {
    if (this.timerId !== undefined) {
      window.clearInterval(this.timerId);
      this.timerId = undefined;
    }
  }

  handleMouseOver() {
    this.hover = true;
  }

  handleMouseLeave() {
    this.hover = false;
  }

  handleTick() {
    if (!this.state.visible && this.hover) {
      this.show();
    } else if (this.state.visible && !this.hover) {
      this.hide();
    }
  }

  handleClick() {
    this.show();
  }

  show() {
    const el = this.menuItemRef.current;
    if (!el) {
      return;
    }

    const rect = el.getBoundingClientRect();
    let x = 0;
    const y = 0;

    if (rect.right + 250 < window.innerWidth) {
      x = rect.width;
    }

    this.setState({ visible: true, x: x, y: y });
  }

  hide() {
    this.setState({ visible: false, x: 0, y: 0 });
  }
}
