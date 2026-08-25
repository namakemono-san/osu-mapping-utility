import * as signalR from '@microsoft/signalr'

const HUB_ORIGIN = 'http://localhost:7002'
const CONNECT_ATTEMPTS = 10
const CONNECT_RETRY_MS = 2000
const DEFAULT_INVOKE_TIMEOUT_MS = 120_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HubEventHandler = (...args: any[]) => void

export class HubClient {
  private readonly connection: signalR.HubConnection
  private connectPromise: Promise<boolean> | null = null

  constructor(path: string, options?: { serverTimeoutMs?: number }) {
    let builder = new signalR.HubConnectionBuilder()
      .withUrl(`${HUB_ORIGIN}${path}`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
    if (options?.serverTimeoutMs !== undefined)
      builder = builder.withServerTimeout(options.serverTimeoutMs)
    this.connection = builder.build()
  }

  start(): Promise<boolean> {
    if (this.connection.state === signalR.HubConnectionState.Connected) return Promise.resolve(true)
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = (async () => {
      for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt++) {
        try {
          await this.connection.start()
          return true
        } catch {
          if (attempt < CONNECT_ATTEMPTS - 1)
            await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS))
        }
      }
      return false
    })().finally(() => {
      this.connectPromise = null
    })

    return this.connectPromise
  }

  on(event: string, handler: HubEventHandler): () => void {
    this.connection.on(event, handler)
    return () => this.connection.off(event, handler)
  }

  async invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    if (!(await this.start())) throw new Error('Could not connect to the local server.')
    return this.connection.invoke<T>(method, ...args)
  }

  async invokeJson<T>(method: string, ...args: unknown[]): Promise<T> {
    return JSON.parse(await this.invoke<string>(method, ...args)) as T
  }

  async invokeWithEvents(
    method: string,
    args: unknown[],
    completeEvent: string,
    errorEvent: string,
    extraHandlers: Array<[string, HubEventHandler]> = [],
    timeoutMs = DEFAULT_INVOKE_TIMEOUT_MS
  ): Promise<void> {
    if (!(await this.start())) throw new Error('Could not connect to the local server.')

    return new Promise((resolve, reject) => {
      let settled = false
      const unsubscribes: Array<() => void> = []

      const cleanup = (): void => {
        clearTimeout(timer)
        for (const off of unsubscribes) off()
      }
      const settle = (action: () => void): void => {
        if (settled) return
        settled = true
        cleanup()
        action()
      }

      const timer = setTimeout(
        () => settle(() => reject(new Error(`Timed out waiting for ${method} to complete`))),
        timeoutMs
      )

      unsubscribes.push(this.on(completeEvent, () => settle(resolve)))
      unsubscribes.push(
        this.on(errorEvent, (message: string) => settle(() => reject(new Error(message))))
      )
      for (const [event, handler] of extraHandlers) unsubscribes.push(this.on(event, handler))

      this.connection.invoke(method, ...args).catch((err: unknown) => {
        settle(() => reject(err instanceof Error ? err : new Error(String(err))))
      })
    })
  }
}
