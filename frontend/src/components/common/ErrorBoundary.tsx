import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Catches render/lifecycle errors anywhere below it so one broken
 * component doesn't blank the entire page — without this, React unmounts
 * the whole tree on an uncaught error and there's nothing left to look at
 * until the user manually refreshes. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Uncaught error, showing fallback UI:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-ink-muted mb-4">Something went wrong.</p>
            <button onClick={() => window.location.reload()} className="btn-brand px-6 py-2">
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
