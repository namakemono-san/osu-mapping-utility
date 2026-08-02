import { createPortal } from 'react-dom'
import { IconDownload, IconAlertTriangle } from '@tabler/icons-react'
import type { AutoUpdaterState } from '../hooks/useAutoUpdater'

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

function formatDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString()
}

export function UpdateModal({ state }: { state: AutoUpdaterState }): React.JSX.Element | null {
  const { status, info, progress, errorMessage, startDownload, dismiss } = state

  const showErrorModal = status === 'error' && info.version != null
  if (
    status !== 'available' &&
    status !== 'downloading' &&
    status !== 'downloaded' &&
    !showErrorModal
  )
    return null

  const closable = status === 'available' || showErrorModal

  return createPortal(
    <div
      className="settings-backdrop-in fixed inset-0 z-[60] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => {
        if (closable && e.target === e.currentTarget) dismiss()
      }}
    >
      <div className="settings-panel-in w-full max-w-md mx-4 bg-surface rounded-lg shadow-2xl overflow-hidden">
        {status === 'available' && (
          <div className="px-5 pt-4 pb-4 flex flex-col gap-3">
            <span className="text-base font-semibold text-text-primary">Update Available</span>
            <div className="text-sm text-text-secondary">
              <div>Version: {info.version ?? '—'}</div>
              {formatDate(info.releaseDate) && (
                <div>Release Date: {formatDate(info.releaseDate)}</div>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg bg-surface-dark border border-border px-3 py-2 text-xs text-text-secondary whitespace-pre-wrap">
              {info.releaseNotes || 'No release notes available'}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={dismiss}
                className="h-9 px-3 rounded text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Later
              </button>
              <button
                onClick={startDownload}
                className="flex items-center gap-1.5 h-9 px-3 rounded text-sm font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
              >
                <IconDownload size={16} stroke={1.5} />
                Install
              </button>
            </div>
          </div>
        )}

        {status === 'downloading' && (
          <div className="px-5 pt-4 pb-4 flex flex-col gap-3">
            <span className="text-base font-semibold text-text-primary">Downloading Update</span>
            <div className="h-2 rounded-full bg-surface-dark overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-text-dim">
              <span>{(progress?.percent ?? 0).toFixed(0)}%</span>
              <span>
                {formatBytes(progress?.transferred ?? 0)} / {formatBytes(progress?.total ?? 0)}
              </span>
            </div>
            <p className="text-xs text-text-dim">
              The app will restart automatically after installation.
            </p>
          </div>
        )}

        {status === 'downloaded' && (
          <div className="px-5 pt-4 pb-4 flex flex-col gap-2">
            <span className="text-base font-semibold text-text-primary">Restarting…</span>
            <p className="text-sm text-text-dim">Installing the update and restarting the app.</p>
          </div>
        )}

        {showErrorModal && (
          <div className="px-5 pt-4 pb-4 flex flex-col gap-3">
            <span className="flex items-center gap-2 text-base font-semibold text-red-400">
              <IconAlertTriangle size={18} stroke={1.5} />
              Failed to install update
            </span>
            <p className="text-sm text-text-dim">{errorMessage ?? 'An unknown error occurred.'}</p>
            <div className="flex justify-end pt-1">
              <button
                onClick={dismiss}
                className="h-9 px-3 rounded text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
