import type { PortalRole, StageDefinition, StageId } from '../stages'
import {
  activeStageIndex,
  formatPartyList,
  isStageFullyComplete,
  isStageReachable,
  pendingPartiesForStage,
} from '../stages'
import './Timeline.css'

interface TimelineProps {
  stages: StageDefinition[]
  currentIndex: number
  completed: Set<StageId>
  formData: Record<string, unknown>
  viewerRole?: PortalRole
  onSelect: (index: number) => void
}

export function Timeline({
  stages,
  currentIndex,
  completed,
  formData,
  viewerRole,
  onSelect,
}: TimelineProps) {
  const activeIndex = activeStageIndex(completed, formData)

  return (
    <nav className="timeline" aria-label="Application progress">
      <ol className="timeline-track">
        {stages.map((stage, index) => {
          const isComplete = isStageFullyComplete(stage.id, completed, formData)
          const isActive = index === activeIndex && !isComplete
          const isCurrent = index === currentIndex
          const isReachable = isStageReachable(index, completed, formData)
          const waitingOn =
            isActive && (stage.id === 'lease' || stage.id === 'movein')
              ? pendingPartiesForStage(stage.id, formData)
              : isActive
                ? stage.canEdit.filter((r) => r !== 'admin')
                : []
          const waitingOnMe =
            isActive &&
            viewerRole &&
            (waitingOn.includes(viewerRole) ||
              (viewerRole === 'admin' && waitingOn.includes('agent')))

          let status: 'complete' | 'current' | 'pending' | 'locked' | 'reached'
          if (isComplete) status = 'complete'
          else if (isActive && waitingOn.length > 0 && !waitingOnMe) status = 'pending'
          else if (isActive || isCurrent) status = 'current'
          else if (isReachable) status = 'reached'
          else status = 'locked'

          const waitLabel =
            waitingOn.length > 0 ? `Waiting on ${formatPartyList(waitingOn)}` : ''

          return (
            <li
              key={stage.id}
              className={`timeline-step phase-${stage.phase} status-${status}`}
            >
              {index > 0 ? (
                <span
                  className={`timeline-connector ${index <= activeIndex ? 'filled' : ''}`}
                  aria-hidden="true"
                />
              ) : null}
              <button
                type="button"
                className="timeline-node"
                disabled={!isReachable}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${stage.title}${
                  isComplete
                    ? ', completed'
                    : isActive
                      ? `, current. ${waitLabel}`
                      : !isReachable
                        ? ', locked until previous steps are finished'
                        : ''
                }`}
                title={
                  !isReachable
                    ? 'Locked until previous steps are completed'
                    : waitLabel || stage.title
                }
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
                  ) : status === 'locked' ? (
                    <svg
                      className="timeline-lock"
                      viewBox="0 0 20 20"
                      width="14"
                      height="14"
                      aria-hidden="true"
                    >
                      <path
                        fill="currentColor"
                        d="M10 2a3 3 0 0 0-3 3v2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V5a3 3 0 0 0-3-3Zm-1 5V5a1 1 0 1 1 2 0v2H9Z"
                      />
                    </svg>
                  ) : (
                    <span className="timeline-number">{stage.number}</span>
                  )}
                </span>
                <span className="timeline-label">
                  <span className="timeline-label-short">{stage.shortTitle}</span>
                  <span className="timeline-label-full">{stage.title}</span>
                  {isActive && waitLabel ? (
                    <span className="timeline-wait">{waitLabel}</span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
