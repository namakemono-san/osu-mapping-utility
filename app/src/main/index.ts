import { app, shell, BrowserWindow, ipcMain, nativeImage, protocol, net, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { spawn, ChildProcess } from 'child_process'
import { request } from 'http'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import iconCanary from '../../resources/icon-canary.png?asset'
import { log, logsDir } from './logger'

process.on('uncaughtException', (err) =>
  log('electron', 'error', `Uncaught exception: ${err.stack ?? err}`)
)
process.on('unhandledRejection', (reason) =>
  log('electron', 'error', `Unhandled rejection: ${reason}`)
)

const isCanary = app.getVersion().includes('canary')
const appIcon = isCanary ? iconCanary : icon

const ALLOWED_EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'osu:'])

function isAllowedExternalUrl(url: string): boolean {
  try {
    return ALLOWED_EXTERNAL_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}

let mainWindow: BrowserWindow | null = null
let bgSetterWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

function getBinPath(): string {
  return is.dev ? join(app.getAppPath(), 'resources', 'bin') : join(process.resourcesPath, 'bin')
}

function startServer(): void {
  const env = { ...process.env, BINS_PATH: getBinPath() }
  if (is.dev) {
    const serverProjectPath = join(app.getAppPath(), '..', 'MappingUtility.Server')
    log('electron', 'info', `Starting server via dotnet run: ${serverProjectPath}`)
    serverProcess = spawn(
      'dotnet',
      ['run', '--project', serverProjectPath, '--', '--parent-pid', String(process.pid)],
      { stdio: ['ignore', 'pipe', 'pipe'], detached: false, env }
    )
  } else {
    const serverExe = join(process.resourcesPath, 'server', 'MappingUtility.Server.exe')
    if (!existsSync(serverExe)) return
    serverProcess = spawn(serverExe, ['--parent-pid', String(process.pid)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env
    })
  }
  serverProcess.stdout?.on('data', (d) => log('server', 'info', d.toString().trimEnd()))
  serverProcess.stderr?.on('data', (d) => log('server', 'error', d.toString().trimEnd()))
  serverProcess.on('exit', (code) =>
    log('electron', 'info', `Server process exited with code ${code}`)
  )
}

function waitForServer(maxWaitMs = 60000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = (): void => {
      const req = request('http://localhost:7002/health', (res) => {
        if (res.statusCode === 200) resolve()
        else retry()
      })
      req.on('error', retry)
      req.end()
    }
    const retry = (): void => {
      if (Date.now() - start < maxWaitMs) setTimeout(check, 200)
      else resolve()
    }
    check()
  })
}

function stopServer(): void {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill()
    serverProcess = null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('maximize', () => {
    mainWindow!.webContents.send('window:maximize-changed', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow!.webContents.send('window:maximize-changed', false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isAllowedExternalUrl(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (gotSingleInstanceLock) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'asset',
      privileges: { secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
  ])

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('moe.nmkmn.osu-mapping-utility')

    protocol.handle('asset', async (request) => {
      try {
        const filePath = decodeURIComponent(request.url.slice('asset:///'.length))
        const headers: Record<string, string> = {}
        const range = request.headers.get('Range')
        if (range) headers['Range'] = range
        return await net.fetch(pathToFileURL(filePath).toString(), { headers })
      } catch {
        return new Response(null, { status: 404 })
      }
    })

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    ipcMain.on('window:minimize', () => mainWindow?.minimize())
    ipcMain.on('window:toggle-maximize', () => {
      if (mainWindow?.isMaximized()) mainWindow.unmaximize()
      else mainWindow?.maximize()
    })
    ipcMain.on('window:close', () => mainWindow?.close())
    ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
    ipcMain.handle('app:icon', () => nativeImage.createFromPath(appIcon).toDataURL())
    ipcMain.handle('app:bin-path', () => getBinPath())
    ipcMain.handle('app:user-data-path', () => app.getPath('userData'))
    ipcMain.handle('app:logs-path', () => logsDir)

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('updater:download-progress', {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total
      })
    })
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('updater:downloaded')
      setTimeout(() => autoUpdater.quitAndInstall(), 1000)
    })
    autoUpdater.on('error', (err) => {
      mainWindow?.webContents.send('updater:error', err.message)
    })

    ipcMain.handle('updater:check', async (_, allowPrerelease: boolean) => {
      try {
        autoUpdater.allowPrerelease = allowPrerelease
        const result = await autoUpdater.checkForUpdates()
        if (!result?.isUpdateAvailable) return { status: 'upToDate' as const }
        const info = result.updateInfo
        const notes =
          typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : (info.releaseNotes?.map((n) => n.note).join('\n\n') ?? null)
        return {
          status: 'available' as const,
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: notes
        }
      } catch {
        return { status: 'error' as const }
      }
    })

    ipcMain.handle('updater:download', async () => {
      try {
        await autoUpdater.downloadUpdate()
        return true
      } catch (err) {
        mainWindow?.webContents.send(
          'updater:error',
          err instanceof Error ? err.message : String(err)
        )
        return false
      }
    })

    ipcMain.handle('dialog:pick-folder', async () => {
      const win = mainWindow ?? BrowserWindow.getFocusedWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    })

    ipcMain.handle('dialog:pick-image', async () => {
      const win = mainWindow ?? BrowserWindow.getFocusedWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    })
    ipcMain.handle('shell:open-path', (_, path: string) => {
      if (typeof path !== 'string' || !existsSync(path)) return 'Path does not exist'
      return shell.openPath(path)
    })
    ipcMain.handle('shell:open-external', (_, url: string) => {
      if (typeof url !== 'string' || !isAllowedExternalUrl(url)) return
      return shell.openExternal(url)
    })

    ipcMain.handle('bg-setter:open', (_, data: string) => {
      if (bgSetterWindow && !bgSetterWindow.isDestroyed()) {
        bgSetterWindow.webContents.send('bg-setter:data-update', data)
        bgSetterWindow.focus()
        return
      }
      bgSetterWindow = new BrowserWindow({
        width: 854,
        height: 572,
        resizable: false,
        show: false,
        frame: false,
        autoHideMenuBar: true,
        icon: appIcon,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false
        }
      })
      bgSetterWindow.on('ready-to-show', () => bgSetterWindow!.show())
      bgSetterWindow.on('closed', () => {
        bgSetterWindow = null
      })
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        bgSetterWindow.loadURL(
          `${process.env['ELECTRON_RENDERER_URL']}?bgsetter=1&data=${encodeURIComponent(data)}`
        )
      } else {
        bgSetterWindow.loadFile(join(__dirname, '../renderer/index.html'), {
          query: { bgsetter: '1', data }
        })
      }
    })

    ipcMain.on('bg-setter:save', (_, result: string) => {
      mainWindow?.webContents.send('bg-setter:saved', result)
    })

    startServer()
    waitForServer().then(() => createWindow())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', stopServer)

  app.on('window-all-closed', () => {
    stopServer()
    if (process.platform !== 'darwin') app.quit()
  })
}
