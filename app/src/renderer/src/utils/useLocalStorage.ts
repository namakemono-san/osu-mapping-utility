import { useCallback, useEffect, useRef, useState } from 'react'

export type Codec<T> = {
  serialize: (value: T) => string
  deserialize: (raw: string) => T
}

export function jsonCodec<T>(): Codec<T> {
  return {
    serialize: (value) => JSON.stringify(value),
    deserialize: (raw) => JSON.parse(raw) as T
  }
}

export function stringCodec<T extends string = string>(): Codec<T> {
  return {
    serialize: (value) => value,
    deserialize: (raw) => raw as T
  }
}

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  codec: Codec<T> = jsonCodec<T>()
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? codec.deserialize(raw) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const keyRef = useRef(key)
  const codecRef = useRef(codec)
  useEffect(() => {
    keyRef.current = key
    codecRef.current = codec
  }, [key, codec])

  const setPersisted = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
      try {
        localStorage.setItem(keyRef.current, codecRef.current.serialize(resolved))
        // eslint-disable-next-line no-empty
      } catch {}
      return resolved
    })
  }, [])

  return [value, setPersisted]
}
