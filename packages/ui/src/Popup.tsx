import React, { createRef } from 'react';
import './Popup.css';

interface PopupProps {
  visible: boolean;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export class Popup extends React.Component<PopupProps, unknown> {
  private readonly clickHandler: (e: Event) => void;
  private readonly popStateHandler: (e: Event) => void;
  private readonly ref: React.RefObject<HTMLDivElement>;

  constructor(props: PopupProps) {
    super(props);

    this.clickHandler = this.handleClick.bind(this);
    this.popStateHandler = this.handlePopState.bind(this);
    this.ref = createRef();
  }

  render() {
    let className = 'medplum-popup';
    if (this.props.className) {
      className += ' ' + this.props.className;
    }

    const style: React.CSSProperties = {
      display: this.props.visible ? 'block' : 'none',
      ...this.props.style
    };

    return (
      <div ref={this.ref} className={className} style={style}>
        {this.props.children}
      </div>
    );
  }

  componentDidMount() {
    document.addEventListener('mousedown', this.clickHandler);
    window.addEventListener('popstate', this.popStateHandler);
  }

  componentWillUnmount() {
    document.removeEventListener('mousedown', this.clickHandler);
    window.removeEventListener('popstate', this.popStateHandler);
  }

  private handleClick(e: Event) {
    if (this.ref?.current && !this.ref.current.contains(e.target as Node)) {
      this.props.onClose();
    }
  }

  private handlePopState() {
    this.props.onClose();
  }
}
