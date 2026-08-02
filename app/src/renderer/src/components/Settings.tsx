import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconFolder,
  IconRefresh,
  IconBrandGithub,
  IconWorld,
  IconChevronDown
} from '@tabler/icons-react'
import { jsonCodec, stringCodec, useLocalStorage } from '../utils/useLocalStorage'
import type { AutoUpdaterState } from '../hooks/useAutoUpdater'
import { Toggle } from './Toggle'

type Lang = 'en' | 'ja'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
  songsFolder: string | null
  onSongsFolder: (path: string) => void
  onOpen?: () => void
  updater: AutoUpdaterState
}

function Label({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <label className="block text-sm font-medium text-text-secondary mb-1">{children}</label>
}

function Btn({
  onClick,
  disabled,
  leftIcon,
  children,
  variant = 'light'
}: {
  onClick?: () => void
  disabled?: boolean
  leftIcon?: React.ReactNode
  children: React.ReactNode
  variant?: 'light' | 'default'
}): React.JSX.Element {
  const base =
    'flex items-center gap-1.5 h-9 px-3 rounded text-sm font-medium transition-colors disabled:opacity-40 whitespace-nowrap'
  const styles =
    variant === 'light'
      ? 'bg-primary/15 text-primary hover:bg-primary/25'
      : 'bg-surface-raised text-text-secondary hover:bg-surface hover:text-text-primary border border-border-subtle'
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      {children}
    </button>
  )
}

function Divider(): React.JSX.Element {
  return <div className="h-px bg-border" />
}

export function Settings({
  isOpen,
  onClose,
  songsFolder,
  onSongsFolder,
  onOpen,
  updater
}: SettingsProps): React.JSX.Element | null {
  const [mounted, setMounted] = useState(false)
  const [animateOut, setAnimateOut] = useState(false)
  const [isChangingFolder, setIsChangingFolder] = useState(false)
  const [lang, setLang] = useLocalStorage<Lang>('lang', 'ja', stringCodec())
  const version = import.meta.env.VITE_APP_VERSION as string
  const updateStatus = updater.status
  const [receiveCanary, setReceiveCanary] = useLocalStorage(
    'receiveCanary',
    false,
    jsonCodec<boolean>()
  )

  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      setAnimateOut(false)
      onOpen?.()
    } else if (mounted) {
      setAnimateOut(true)
      const id = setTimeout(() => {
        setMounted(false)
        setAnimateOut(false)
      }, 150)
      return () => clearTimeout(id)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  const handleBrowse = async (): Promise<void> => {
    setIsChangingFolder(true)
    try {
      const selected = await window.api.dialog.pickFolder()
      if (selected) onSongsFolder(selected)
    } catch (err) {
      console.error('Failed to change songs folder:', err)
    } finally {
      setIsChangingFolder(false)
    }
  }

  if (!mounted) return null

  const backdropCls = animateOut ? 'settings-backdrop-out' : 'settings-backdrop-in'
  const panelCls = animateOut ? 'settings-panel-out' : 'settings-panel-in'

  const updateStatusLabel =
    updateStatus === 'checking'
      ? 'Checking...'
      : updateStatus === 'available'
        ? 'Update available'
        : updateStatus === 'upToDate'
          ? 'Up to date'
          : updateStatus === 'downloading'
            ? 'Downloading...'
            : updateStatus === 'downloaded'
              ? 'Restarting...'
              : updateStatus === 'error'
                ? 'Check failed'
                : null

  const updateStatusColor =
    updateStatus === 'available'
      ? 'text-yellow-400'
      : updateStatus === 'upToDate'
        ? 'text-green-400'
        : updateStatus === 'error'
          ? 'text-red-400'
          : 'text-text-dim'

  return createPortal(
    <div
      className={`${backdropCls} fixed inset-0 z-50 flex items-start justify-center pt-[120px]`}
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`${panelCls} w-full max-w-lg mx-4 bg-surface rounded-lg shadow-2xl overflow-hidden`}
      >
        <div className="px-5 pt-4 pb-2">
          <span className="text-base font-semibold text-text-primary">Settings</span>
        </div>

        <div className="px-5 pt-1 pb-4 flex flex-col gap-4">
          <div>
            <Label>osu! Songs Folder</Label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={songsFolder ?? ''}
                placeholder="Not set"
                className="flex-1 min-w-0 h-9 px-3 rounded bg-surface-dark border border-border text-sm text-text-secondary placeholder-text-muted focus:outline-none cursor-default select-none"
              />
              <Btn
                onClick={handleBrowse}
                disabled={isChangingFolder}
                leftIcon={<IconFolder size={16} stroke={1.5} />}
                variant="light"
              >
                Browse
              </Btn>
            </div>
          </div>

          <div>
            <Label>Language</Label>
            <div className="relative">
              <select
                value={lang}
                onChange={(e) => {
                  const v = e.target.value as Lang
                  setLang(v)
                  document.documentElement.lang = v
                }}
                className="w-full h-9 pl-3 pr-8 rounded bg-surface-dark border border-border text-sm text-text-secondary appearance-none cursor-pointer focus:outline-none transition-colors"
              >
                <option value="en">English</option>
                <option value="ja">日本語</option>
              </select>
              <IconChevronDown
                size={13}
                stroke={2}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim"
              />
            </div>
          </div>

          <Divider />

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Application updates</p>
              <p className="text-sm text-text-dim">
                Current version: {version || '—'}
                {updateStatusLabel && (
                  <span className={`ml-2 ${updateStatusColor}`}> · {updateStatusLabel}</span>
                )}
              </p>
            </div>
            <Btn
              onClick={updater.checkNow}
              disabled={updateStatus === 'checking'}
              leftIcon={
                <IconRefresh
                  size={16}
                  stroke={1.5}
                  className={updateStatus === 'checking' ? 'animate-spin' : ''}
                />
              }
              variant="light"
            >
              Check for updates
            </Btn>
          </div>

          <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
            <div>
              <p className="text-sm text-text-primary">Receive canary updates</p>
              <p className="text-xs text-text-dim">
                {receiveCanary
                  ? 'Includes canary releases like 2.0.0-canary.1 when available.'
                  : 'Only stable releases will be offered.'}
              </p>
            </div>
            <Toggle checked={receiveCanary} onChange={setReceiveCanary} />
          </label>

          <Divider />

          <div className="flex gap-2">
            <button
              onClick={() => window.api.getUserDataPath().then((p) => window.api.shell.openPath(p))}
              className="flex flex-1 items-center justify-center gap-1.5 h-9 px-3 rounded border border-border-subtle bg-surface-raised text-sm text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
            >
              <IconFolder size={16} stroke={1.5} />
              Open app folder
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() =>
                window.api.shell.openExternal(
                  'https://github.com/namakemono-san/osu-mapping-utility'
                )
              }
              className="flex flex-1 items-center justify-center gap-1.5 h-9 px-3 rounded border border-border-subtle bg-surface-raised text-sm text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
            >
              <IconBrandGithub size={16} stroke={1.5} />
              Source code
            </button>
            <button
              onClick={() => window.api.shell.openExternal('https://nmkmn.moe')}
              className="flex flex-1 items-center justify-center gap-1.5 h-9 px-3 rounded border border-border-subtle bg-surface-raised text-sm text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
            >
              <IconWorld size={16} stroke={1.5} />
              Website
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
