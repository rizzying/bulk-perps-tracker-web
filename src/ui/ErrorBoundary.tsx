import { Component, ReactNode } from "react";
/** Keeps one broken widget (e.g. a chart) from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() { return this.state.err ? <div className="card err">Couldn't render {this.props.label ?? "this section"}: {this.state.err} <button className="link" onClick={() => this.setState({ err: null })}>retry</button></div> : this.props.children; }
}
