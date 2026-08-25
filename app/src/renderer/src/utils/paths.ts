function encodePath(segment: string): string {
  return segment.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
}

export function assetUrl(...segments: (string | null | undefined)[]): string | null {
  if (segments.some((segment) => !segment)) return null
  return `asset:///${segments.map((segment) => encodePath(segment as string)).join('/')}`
}

export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase()
}
