import type { StageDefinition, StageId } from '../stages'
import './Timeline.css'

interface TimelineProps {
  stages: StageDefinition[]
  currentIndex: number
  completed: Set<StageId>
  onSelect: (index: number) => void
}

export function Timeline({ stages, currentIndex, completed, onSelect }: TimelineProps) {
  const maxReached = Math.max(
    currentIndex,
    ...stages.map((s, i) => (completed.has(s.id) ? i : -1)),
  )

  return (
    <nav className="timeline" aria-label="Application progress">
      <ol className="timeline-track">
        {stages.map((stage, index) => {
          const isComplete = completed.has(stage.id)
          const isCurrent = index === currentIndex
          const isReachable = index <= maxReached
          const status = isComplete ? 'complete' : isCurrent ? 'current' : isReachable ? 'reached' : 'upcoming'

          return (
            <li key={stage.id} className={`timeline-step phase-${stage.phase} status-${status}`}>
              {index > 0 ? (
                <span
                  className={`timeline-connector ${index <= maxReached ? 'filled' : ''}`}
                  aria-hidden="true"
                />
              ) : null}
              <button
                type="button"
                className="timeline-node"
                disabled={!isReachable}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${stage.title}${isComplete ? ', completed' : isCurrent ? ', current' : ''}`}
                onClick={() => onSelect(index)}
              >
                <span className="timeline-circle">
                  {isComplete ? (
                    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M7.7 13.3 4.4 10l-1.1 1.1 4.4 4.4 9-9L15.6 5.4z"
                      />
                    </svg>
                  ) : (
                    <span className="timeline-number">{stage.number}</span>
                  )}
                </span>
                <span className="timeline-label">
                  <span className="timeline-label-short">{stage.shortTitle}</span>
                  <span className="timeline-label-full">{stage.title}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
