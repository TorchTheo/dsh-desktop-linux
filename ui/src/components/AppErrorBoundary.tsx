import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string | null
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, componentStack: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[DSH Desktop] Uncaught React render error:', error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? null })
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#F4F3EE] p-6 text-[#141413]">
        <div className="w-full max-w-xl rounded-lg border border-[#C2BEB2] bg-[#FAF9F5] p-6 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-[#D13B27]" />
            <h1 className="text-sm font-semibold tracking-tight text-[#141413]">
              界面渲染发生异常（后端与 Agent 仍在正常运行）
            </h1>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-[#575652]">
            前端捕获到一个未处理的渲染错误，已阻止白屏崩溃。你可以直接重试渲染或重新加载界面，不会中断正在运行的后台任务。
          </p>

          <pre className="font-mono-tabular mt-3 max-h-48 overflow-auto rounded border border-[#D8D5CB] bg-[#ECEAE2] p-3 text-[11px] text-[#8f2214]">
            {this.state.error.message}
            {this.state.componentStack ? `\n${this.state.componentStack}` : ''}
          </pre>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null, componentStack: null })}
              className="rounded border border-[#D8D5CB] bg-[#FAF9F5] px-3 py-1.5 text-xs font-medium text-[#141413] hover:bg-[#ECEAE2]"
            >
              重试渲染
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded bg-[#D13B27] px-3.5 py-1.5 text-xs font-medium text-[#FAF9F5] hover:bg-[#b5301f]"
            >
              <RotateCw className="h-3.5 w-3.5" />
              重新加载界面
            </button>
          </div>
        </div>
      </div>
    )
  }
}
