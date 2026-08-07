import { useEffect, useId, useMemo, useRef, useState } from 'react'
import './SearchableSelect.css'

export type SearchableOption = {
  value: string
  label: string
  searchText?: string
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  allLabel = 'All',
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  placeholder?: string
  allLabel?: string
  ariaLabel?: string
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedLabel = useMemo(() => {
    if (!value) return allLabel
    return options.find((o) => o.value === value)?.label ?? allLabel
  }, [value, options, allLabel])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const hay = (o.searchText ?? o.label).toLowerCase()
      return hay.includes(q)
    })
  }, [options, query])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(next: string) {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="searchable-select" ref={rootRef}>
      <button
        type="button"
        className="searchable-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((prev) => !prev)
          setQuery('')
        }}
      >
        <span>{selectedLabel}</span>
        <span className="searchable-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className="searchable-select-menu" role="listbox" id={listId}>
          <input
            type="search"
            className="searchable-select-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            autoFocus
            aria-label={placeholder}
          />
          <button
            type="button"
            className={`searchable-select-option${!value ? ' is-active' : ''}`}
            role="option"
            aria-selected={!value}
            onClick={() => choose('')}
          >
            {allLabel}
          </button>
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`searchable-select-option${value === o.value ? ' is-active' : ''}`}
              role="option"
              aria-selected={value === o.value}
              onClick={() => choose(o.value)}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="searchable-select-empty">No matches</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
