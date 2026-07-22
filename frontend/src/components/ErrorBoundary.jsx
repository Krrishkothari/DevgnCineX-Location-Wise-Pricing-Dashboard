import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

/**
 * Catches render-time errors. There was previously no boundary anywhere in the
 * app, so a single bad row — a null cinema name, a non-string showtime — took
 * the entire dashboard to a white screen.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[UI] Render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="panel flex max-w-lg flex-col items-center gap-4 p-8 text-center">
          <div className="rounded-pill bg-below/10 p-3 text-below">
            <AlertTriangle size={24} aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-ink">This screen crashed</h1>
          <p className="text-sm text-ink-soft">
            The dashboard hit an unexpected error while rendering. Reloading usually clears it.
          </p>
          <pre className="max-h-32 w-full overflow-auto rounded-control bg-elevated p-3 text-left text-xs text-ink-muted">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Dismiss
            </Button>
            <Button onClick={() => window.location.reload()}>Reload page</Button>
          </div>
        </div>
      </div>
    );
  }
}
