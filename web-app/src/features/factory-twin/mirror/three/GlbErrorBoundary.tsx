// Catches errors thrown while loading/parsing the factory GLB (bad path, corrupt file,
// mid-export, unreachable Draco decoder, etc.) and renders a fallback instead of letting
// the error crash the whole React tree (white screen). Demo-safety critical.
import { Component, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class GlbErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[GLB] 載入失敗，已改用 placeholder：', error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
