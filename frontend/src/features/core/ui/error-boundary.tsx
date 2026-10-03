import { Component, type ComponentType, type ReactNode } from "react";

export interface ErrorFallbackProps {
  /** Render the failed children again from a new start. */
  reset: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown in place of the children after one of them fails to render. */
  Fallback: ComponentType<ErrorFallbackProps>;
  /** The children render again when this value changes, such as on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  failed: boolean;
  resetKey: unknown;
}

/**
 * Keeps a rendering error in one part of the page from blanking all of it.
 * React needs a class for this. The root's error callbacks in `main.tsx` do
 * the logging, so this component only swaps in the fallback.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {
    failed: false,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): ErrorBoundaryState | null {
    return Object.is(props.resetKey, state.resetKey)
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  private readonly reset = (): void => {
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    const { Fallback, children } = this.props;
    return this.state.failed ? <Fallback reset={this.reset} /> : children;
  }
}
