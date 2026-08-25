import { useEffect, useState } from 'react'
import { onBeatmapsetChanged } from '../services'
import { samePath } from '../utils/paths'

export function useBeatmapsetRevision(folderPath: string | null | undefined): number {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    setRevision(0)
    if (!folderPath) return
    return onBeatmapsetChanged((changedPath) => {
      if (samePath(changedPath, folderPath)) setRevision((prev) => prev + 1)
    })
  }, [folderPath])

  return revision
}
