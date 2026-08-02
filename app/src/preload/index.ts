import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChanged: (cb: (maximized: boolean) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, maximized: boolean): void => cb(maximized)
      ipcRenderer.on('window:maximize-changed', listener)
      return () => ipcRenderer.removeListener('window:maximize-changed', listener)
    }
  },
  shell: {
    openPath: (path: string): Promise<string> => ipcRenderer.invoke('shell:open-path', path),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url)
  },
  getIcon: (): Promise<string> => ipcRenderer.invoke('app:icon'),
  getBinPath: (): Promise<string> => ipcRenderer.invoke('app:bin-path'),
  getUserDataPath: (): Promise<string> => ipcRenderer.invoke('app:user-data-path'),
  getLogsPath: (): Promise<string> => ipcRenderer.invoke('app:logs-path'),
  updater: {
    check: (
      allowPrerelease: boolean
    ): Promise<{
      status: 'available' | 'upToDate' | 'error'
      version?: string
      releaseDate?: string
      releaseNotes?: string | null
    }> => ipcRenderer.invoke('updater:check', allowPrerelease),
    download: (): Promise<boolean> => ipcRenderer.invoke('updater:download'),
    onDownloadProgress: (
      cb: (progress: { percent: number; transferred: number; total: number }) => void
    ): (() => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        progress: { percent: number; transferred: number; total: number }
      ): void => cb(progress)
      ipcRenderer.on('updater:download-progress', listener)
      return () => ipcRenderer.removeListener('updater:download-progress', listener)
    },
    onDownloaded: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('updater:downloaded', listener)
      return () => ipcRenderer.removeListener('updater:downloaded', listener)
    },
    onError: (cb: (message: string) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, message: string): void => cb(message)
      ipcRenderer.on('updater:error', listener)
      return () => ipcRenderer.removeListener('updater:error', listener)
    }
  },
  dialog: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-folder'),
    pickImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-image')
  },
  bgSetter: {
    open: (data: string): Promise<void> => ipcRenderer.invoke('bg-setter:open', data),
    save: (result: string): void => ipcRenderer.send('bg-setter:save', result),
    onSaved: (cb: (result: string) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, result: string): void => cb(result)
      ipcRenderer.on('bg-setter:saved', listener)
      return () => ipcRenderer.removeListener('bg-setter:saved', listener)
    },
    onDataUpdate: (cb: (data: string) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: string): void => cb(data)
      ipcRenderer.on('bg-setter:data-update', listener)
      return () => ipcRenderer.removeListener('bg-setter:data-update', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
