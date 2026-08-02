import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      window: {
        minimize: () => void
        toggleMaximize: () => void
        close: () => void
        isMaximized: () => Promise<boolean>
        onMaximizeChanged: (cb: (maximized: boolean) => void) => () => void
      }
      shell: {
        openPath: (path: string) => Promise<string>
        openExternal: (url: string) => Promise<void>
      }
      getIcon: () => Promise<string>
      getBinPath: () => Promise<string>
      dialog: {
        pickFolder: () => Promise<string | null>
        pickImage: () => Promise<string | null>
      }
      getUserDataPath: () => Promise<string>
      getLogsPath: () => Promise<string>
      updater: {
        check: (allowPrerelease: boolean) => Promise<{
          status: 'available' | 'upToDate' | 'error'
          version?: string
          releaseDate?: string
          releaseNotes?: string | null
        }>
        download: () => Promise<boolean>
        onDownloadProgress: (
          cb: (progress: { percent: number; transferred: number; total: number }) => void
        ) => () => void
        onDownloaded: (cb: () => void) => () => void
        onError: (cb: (message: string) => void) => () => void
      }
      bgSetter: {
        open: (data: string) => Promise<void>
        save: (result: string) => void
        onSaved: (cb: (result: string) => void) => () => void
        onDataUpdate: (cb: (data: string) => void) => () => void
      }
    }
  }
}
