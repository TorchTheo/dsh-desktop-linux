import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'

export function App() {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const workerStatus = useAppStore((s) => s.workerStatus)

  useEffect(() => {
    let cleanup: (() => void) | undefined
    void bootstrap().then((fn) => {
      cleanup = fn
    })
    return () => {
      cleanup?.()
    }
  }, [bootstrap])

  return (
    <div className="flex h-screen items-center justify-center bg-[#0d1117] text-[#e6edf3]">
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] px-6 py-4 text-sm">
        DSH Desktop UI Scaffold · Worker: {workerStatus.state}
      </div>
    </div>
  )
}

export default App
