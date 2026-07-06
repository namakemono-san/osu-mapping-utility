export type MetadataFieldKey =
  | 'artistUnicode'
  | 'artist'
  | 'titleUnicode'
  | 'title'
  | 'source'
  | 'tags'

export type MetadataFields = Record<MetadataFieldKey, string>

export const METADATA_FIELDS: { key: MetadataFieldKey; label: string; textarea?: boolean }[] = [
  { key: 'artistUnicode', label: 'Artist' },
  { key: 'artist', label: 'Romanised Artist' },
  { key: 'titleUnicode', label: 'Title' },
  { key: 'title', label: 'Romanised Title' },
  { key: 'source', label: 'Source' },
  { key: 'tags', label: 'Tags', textarea: true }
]

export const EMPTY_METADATA_FIELDS: MetadataFields = {
  artistUnicode: '',
  artist: '',
  titleUnicode: '',
  title: '',
  source: '',
  tags: ''
}

export function asciiOnly(s: string): string {
  return [...s].filter((c) => c.charCodeAt(0) <= 126).join('')
}

export function isAllAscii(s: string): boolean {
  return s.length > 0 && [...s].every((c) => c.charCodeAt(0) <= 126)
}

export function applyMetadataFieldChange(
  fields: MetadataFields,
  key: MetadataFieldKey,
  value: string
): MetadataFields {
  const next = { ...fields }
  if (key === 'artistUnicode') {
    next.artistUnicode = value
    next.artist = isAllAscii(value) ? value : asciiOnly(next.artist)
  } else if (key === 'titleUnicode') {
    next.titleUnicode = value
    next.title = isAllAscii(value) ? value : asciiOnly(next.title)
  } else if (key === 'artist' || key === 'title') {
    next[key] = asciiOnly(value)
  } else {
    next[key] = value
  }
  return next
}

export function isRomanisedFieldDisabled(fields: MetadataFields, key: MetadataFieldKey): boolean {
  if (key === 'artist') return isAllAscii(fields.artistUnicode)
  if (key === 'title') return isAllAscii(fields.titleUnicode)
  return false
}
