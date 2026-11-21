import { useState } from 'react'
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
    <div className="overflow-hidden rounded-lg border border-[#D8D5CB] border-l-[3px] border-l-[#1E4D9B] bg-[#FAF9F5]">
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#1E4D9B]" />
          <span className="font-mono-tabular text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1E4D9B]">
            助手请求确认
          </span>
        </div>

        {items.map((item, idx) => {
          const qId = item.id ?? `q-${idx}`
          const selected = answers[qId] ?? []
          return (
            <div key={qId} className="space-y-2.5">
              {item.header && (
                <div className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#8A8880]">
                  {item.header}
                </div>
              )}
              <p className="text-sm font-medium leading-relaxed text-[#141413]">{item.question}</p>

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
                        className={`rounded border px-3 py-1.5 text-left text-xs transition ${
                          active
                            ? 'border-[#1E4D9B] bg-[#1E4D9B] text-[#FAF9F5]'
                            : 'border-[#D8D5CB] bg-[#F4F3EE] text-[#141413] hover:border-[#1E4D9B]'
                        }`}
                      >
                        <div className="font-medium">{opt.label}</div>
                        {opt.description && (
                          <div
                            className={`mt-0.5 text-[11px] ${
                              active ? 'text-[#FAF9F5]/80' : 'text-[#575652]'
                            }`}
                          >
                            {opt.description}
                          </div>
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
                className="w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] px-3 py-1.5 text-xs text-[#141413] placeholder-[#8A8880] focus:border-[#1E4D9B] focus:bg-[#FAF9F5] focus:outline-none"
              />
            </div>
          )
        })}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded bg-[#1E4D9B] px-3.5 py-1.5 text-xs font-medium text-[#FAF9F5] transition hover:bg-[#173d7c]"
          >
            提交回答
          </button>
          <button
            type="button"
            onClick={() => void respondUserQuestion(request.requestId, { cancelled: true })}
            className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-3 py-1.5 text-xs font-medium text-[#575652] transition hover:border-[#141413] hover:text-[#141413]"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
