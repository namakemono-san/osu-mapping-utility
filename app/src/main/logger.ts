import { app } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync } from 'fs'

export const logsDir = join(app.getPath('appData'), 'osu-mapping-utility', 'logs')

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function localTimestamp(): string {
  const d = new Date()
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`
  return `${date} ${time}`
}

function localDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function logFileFor(component: string): string {
  return join(logsDir, `${component}-${localDate()}.log`)
}

export type LogLevel = 'info' | 'warn' | 'error'

export function log(component: string, level: LogLevel, message: string): void {
  const line = `[${localTimestamp()}] [${level.toUpperCase()}] ${message}`
  if (level === 'error') console.error(line)
  else console.log(line)
  try {
    mkdirSync(logsDir, { recursive: true })
    appendFileSync(logFileFor(component), line + '\n', 'utf-8')
    // eslint-disable-next-line no-empty
  } catch {}
}
