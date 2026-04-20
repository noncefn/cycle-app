import React from "react";

interface State { err: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; label?: string }, State> {
  state: State = { err: null };
  static getDerivedStateFromError(err: Error): State { return { err }; }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught", this.props.label, err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="card" style={{ background: "#3a1a1a", borderColor: "#7f1d1d", color: "var(--danger)" }}>
          <strong>{this.props.label || "컴포넌트"} 오류</strong>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 8 }}>
            {this.state.err.message}
            {"\n\n"}
            {this.state.err.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
