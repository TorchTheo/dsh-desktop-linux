import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { UserQuestionItem, UserQuestionRequestEvent } from '../types/domain'

interface Props {
  request: UserQuestionRequestEvent
}

function normalizeQuestions(raw: unknown): UserQuestionItem[] {
  if (Array.isArray(raw)) {
    return raw.map((item, index) => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        return {
          id: typeof obj.id === 'string' ? obj.id : `q-${index}`,
          question:
            typeof obj.question === 'string'
              ? obj.question
              : typeof obj.prompt === 'string'
                ? obj.prompt
                : typeof obj.title === 'string'
                  ? obj.title
                  : JSON.stringify(obj),
          header: typeof obj.header === 'string' ? obj.header : undefined,
          multiSelect: Boolean(obj.multiSelect),
          options: Array.isArray(obj.options)
            ? obj.options
                .filter((opt): opt is Record<string, unknown> => Boolean(opt && typeof opt === 'object'))
                .map((opt) => ({
                  label: typeof opt.label === 'string' ? opt.label : String(opt.value ?? ''),
                  description: typeof opt.description === 'string' ? opt.description : undefined,
                  value: typeof opt.value === 'string' ? opt.value : undefined,
                }))
            : undefined,
        }
      }
      return { id: `q-${index}`, question: String(item) }
    })
  }
  return [{ id: 'q-0', question: typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2) }]
}

export function QuestionCard({ request }: Props) {
  const respondUserQuestion = useAppStore((s) => s.respondUserQuestion)
  const items = normalizeQuestions(request.questions)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [freeText, setFreeText] = useState<Record<string, string>>({})

  const toggleOption = (qId: string, value: string, multi: boolean) => {
    setAnswers((prev) => {
      const current = prev[qId] ?? []
      if (multi) {
        return {
          ...prev,
          [qId]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
        }
      }
      return { ...prev, [qId]: [value] }
    })
  }

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {}
    for (const item of items) {
      const qId = item.id ?? 'q-0'
      const chosen = answers[qId] ?? []
      const text = (freeText[qId] ?? '').trim()
      if (item.multiSelect) {
        payload[qId] = text ? [...chosen, text] : chosen
      } else {
        payload[qId] = text || chosen[0] || ''
      }
    }
    void respondUserQuestion(request.requestId, { answers: payload })
  }

  return (
    <div className="rounded-xl border border-blue-500/40 bg-blue-950/20 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="text-sm font-semibold text-blue-200">Agent 请求你的输入</div>

          {items.map((item, idx) => {
            const qId = item.id ?? `q-${idx}`
            const selected = answers[qId] ?? []
            return (
              <div key={qId} className="space-y-2">
                {item.header && (
                  <div className="text-[11px] font-medium uppercase tracking-wider text-blue-300/80">
                    {item.header}
                  </div>
                )}
                <p className="text-xs leading-relaxed text-[#e6edf3]">{item.question}</p>

                {item.options && item.options.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {item.options.map((opt) => {
                      const val = opt.value ?? opt.label
                      const active = selected.includes(val)
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => toggleOption(qId, val, Boolean(item.multiSelect))}
                          className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                            active
                              ? 'border-blue-400 bg-blue-500/20 text-blue-100'
                              : 'border-[#30363d] bg-[#161b22] text-[#c9d1d9] hover:border-[#58a6ff]'
                          }`}
                        >
                          <div className="font-medium">{opt.label}</div>
                          {opt.description && (
                            <div className="mt-0.5 text-[11px] text-[#8b949e]">{opt.description}</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}

                <input
                  type="text"
                  value={freeText[qId] ?? ''}
                  onChange={(e) => setFreeText((prev) => ({ ...prev, [qId]: e.target.value }))}
                  placeholder={item.options?.length ? '或输入自定义补充...' : '请输入回复...'}
                  className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs text-[#e6edf3] placeholder-[#6e7681] focus:border-blue-500 focus:outline-none"
                />
              </div>
            )
          })}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
            >
              提交回答
            </button>
            <button
              type="button"
              onClick={() => void respondUserQuestion(request.requestId, { cancelled: true })}
              className="rounded-md border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-xs font-medium text-[#8b949e] transition hover:text-[#e6edf3]"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
