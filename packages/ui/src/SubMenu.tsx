import React from 'react';
import { PopupMenu } from './PopupMenu';
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
  private hover: boolean = false;

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
        onClick={e => this.handleClick(e)}
        onMouseOver={() => this.handleMouseOver()}
        onMouseLeave={() => this.handleMouseLeave()}>
        {this.props.title}
        <span className="medplum-submenu-arrow" style={{ userSelect: 'none' }}>{'\u25BA'}</span>
        <PopupMenu
          visible={this.state.visible}
          x={this.state.x}
          y={this.state.y}
          onClose={() => this.setState({ visible: false })}>
          {this.props.children}
        </PopupMenu>
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

  handleClick(e: React.MouseEvent) {
    // Calculate position relative to the title menu item
    this.show();
  }

  show() {
    const el = this.menuItemRef.current;
    if (!el) {
      return;
    }

    const rect = el.getBoundingClientRect();
    let x = 0;
    let y = 0;

    if (rect.right + 250 < window.innerWidth) {
      x = rect.width;
    } else {
      x = 0;
    }

    this.setState({ visible: true, x: x, y: y });
  }

  hide() {
    this.setState({ visible: false, x: 0, y: 0 });
  }
}
