import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last line of defence: a render error shows a message instead of a blank page. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[mesh-studio] UI crashed', error, info.componentStack);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-lg rounded-xl border border-err bg-surface p-6">
          <b className="block text-lg text-err">Mesh Studio hit an unexpected error</b>
          <p className="my-2 text-[13px] text-muted">{this.state.error.message}</p>
          <p className="my-2 text-[12.5px] text-muted">Your settings are safe. Unsaved scene changes are lost on reload — export your work if you can.</p>
          <div className="flex justify-center gap-2">
            <button type="button" onClick={() => this.setState({ error: null })} className="rounded-[7px] border border-line-strong bg-surface-2 px-3 py-1.5 text-[13px] font-bold">Try to continue</button>
            <button type="button" onClick={() => location.reload()} className="rounded-[7px] border border-accent bg-accent px-3 py-1.5 text-[13px] font-bold text-white">Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
