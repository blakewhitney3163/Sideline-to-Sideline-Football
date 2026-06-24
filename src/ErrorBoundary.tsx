import React from 'react';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: string; }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, error: err.message ?? 'Unknown error' };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', err, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0a', fontFamily: 'monospace', padding: 40,
      }}>
        <div style={{ fontSize: 10, color: '#e57373', letterSpacing: 3, marginBottom: 12 }}>
          GRIDIRON DYNASTY — UNEXPECTED ERROR
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 16 }}>
          Something went wrong.
        </div>
        <div style={{
          fontSize: 11, color: '#555', maxWidth: 480, textAlign: 'center',
          lineHeight: 1.7, marginBottom: 8,
        }}>
          {this.state.error}
        </div>
        <div style={{ fontSize: 10, color: '#333', marginBottom: 32 }}>
          A crash log has been saved to your userData folder.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '11px 28px', background: '#FF8740', color: '#000',
            border: 'none', borderRadius: 4, fontFamily: 'monospace',
            fontSize: 12, fontWeight: 700, letterSpacing: 2, cursor: 'pointer',
          }}
        >
          RELOAD APP
        </button>
      </div>
    );
  }
}
