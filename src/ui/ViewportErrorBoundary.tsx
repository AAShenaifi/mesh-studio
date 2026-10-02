import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Catches WebGL/R3F failures (e.g. no GPU context) and shows them instead of a blank screen. */
export class ViewportErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[mesh-studio] viewport crashed', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center">
        <div className="max-w-md rounded-xl border border-err bg-surface p-5">
          <b className="block text-base text-err">The 3D viewport stopped</b>
          <p className="my-2 text-[13px] text-muted">
            {/webgl|context/i.test(this.state.error.message)
              ? 'WebGL is not available. Enable hardware acceleration in your browser settings, or try another browser.'
              : this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-[7px] border border-line-strong bg-surface-2 px-3 py-1.5 text-[13px] font-bold hover:bg-surface-3"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
