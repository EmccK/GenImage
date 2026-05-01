import { useMemo, useState } from 'react'
import type { PromptPreset } from '../lib/serverClient'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'

interface Props {
  presets: PromptPreset[]
  onSelect: (prompt: string) => void
  onClose: () => void
}

export default function PromptLibraryModal({ presets, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [activeId, setActiveId] = useState(presets[0]?.id ?? '')

  useCloseOnEscape(true, onClose)

  const categories = useMemo(() => ['全部', ...Array.from(new Set(presets.map((p) => p.category || '通用')))], [presets])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return presets.filter((preset) => {
      if (category !== '全部' && preset.category !== category) return false
      if (!q) return true
      return [preset.title, preset.category, preset.description, preset.prompt, ...(preset.tags ?? [])]
        .filter(Boolean)
        .join('\n')
        .toLowerCase()
        .includes(q)
    })
  }, [category, presets, query])
  const active = filtered.find((p) => p.id === activeId) ?? filtered[0] ?? presets[0]

  return (
    <div data-no-drag-select className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm animate-overlay-in" onClick={onClose} />
      <div className="relative z-10 flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-950/95 dark:ring-white/10">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Prompt 快速模板</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">选择后会填入输入框，再按你的需求微调即可。</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[18rem_1fr]">
          <aside className="min-h-0 border-b border-gray-100 p-4 dark:border-white/[0.08] md:border-b-0 md:border-r">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索风格、场景、用途..."
              className="mb-3 w-full rounded-2xl border border-gray-200/70 bg-white/70 px-3 py-2 text-sm outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
            />
            <div className="mb-3 flex gap-2 overflow-x-auto hide-scrollbar md:flex-wrap">
              {categories.map((item) => (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${category === item ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]'}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="max-h-[26vh] space-y-2 overflow-y-auto px-0.5 py-0.5 custom-scrollbar md:max-h-[52vh]">
              {filtered.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setActiveId(preset.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                    active?.id === preset.id
                      ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)] dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300 dark:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.22)]'
                      : 'border-transparent hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  {preset.imageUrl && (
                    <img
                      src={preset.imageUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-11 w-11 shrink-0 rounded-xl border border-white/70 object-cover shadow-sm dark:border-white/[0.08]"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="line-clamp-1 text-sm font-medium">{preset.title}</div>
                    <div className="mt-0.5 text-[11px] text-gray-400">{preset.category}</div>
                  </div>
                </button>
              ))}
              {!filtered.length && <div className="py-10 text-center text-sm text-gray-400">没有匹配的模板</div>}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col p-5">
            {active ? (
              <>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{active.title}</h4>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{active.description || active.category}</p>
                  </div>
                  <button
                    onClick={() => {
                      onSelect(active.prompt)
                      onClose()
                    }}
                    className="rounded-2xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600"
                  >
                    使用这个模板
                  </button>
                </div>
                {active.imageUrl && (
                  <div className="mb-3 flex max-h-[18rem] min-h-[12rem] items-center justify-center overflow-hidden rounded-3xl border border-gray-200/70 bg-gray-50/70 dark:border-white/[0.08] dark:bg-white/[0.04]">
                    <img
                      src={active.imageUrl}
                      alt={active.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}
                <textarea
                  readOnly
                  value={active.prompt}
                  className={`${active.imageUrl ? 'min-h-[10rem]' : 'min-h-[18rem]'} flex-1 resize-none rounded-3xl border border-gray-200/70 bg-gray-50/70 p-4 text-sm leading-relaxed text-gray-700 outline-none custom-scrollbar dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200`}
                  data-selectable-text
                />
                {active.source && (
                  <a
                    href={active.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 text-xs text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-300"
                  >
                    来源：awesome-gpt-image-2-prompts
                  </a>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-400">暂无模板</div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
