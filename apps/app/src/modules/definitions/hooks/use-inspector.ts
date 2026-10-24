import { useEffect, useEffectEvent, useState } from 'react'

import { useTabNavigate, useTabSearch } from '~/core/connection/route'

const LINKED_OPEN_DELAY = 80

export const useInspector = <T>({
  items,
  keepSchema,
  getKey,
  loading,
}: {
  items: T[]
  keepSchema: (schema: string | undefined) => void
  getKey: (item: T) => string
  loading: boolean
}) => {
  const navigate = useTabNavigate()
  const linkedKey = useTabSearch({ select: (current) => current.open })
  const linkedSchema = useTabSearch({ select: (current) => current.schema })
  const linkedPreset = useTabSearch({ select: (current) => current.create })
  const [inspected, setInspected] = useState<{
    item: T | null
    open: boolean
    preset?: string
    session: number
  }>({ item: null, open: false, session: 0 })
  const linkedItem = linkedKey
    ? items.find((item) => getKey(item) === linkedKey)
    : undefined
  const open = (item: T | null, preset?: string) =>
    setInspected((current) => ({
      item,
      open: true,
      preset,
      session: current.session + 1,
    }))

  const openLinked = useEffectEvent(() => {
    if (linkedItem) {
      open(linkedItem)
    } else if (linkedPreset) {
      open(null, linkedPreset)
    }
    keepSchema(linkedSchema)
    navigate({
      replace: true,
      search: (current) => ({
        ...current,
        create: undefined,
        open: undefined,
        schema: undefined,
      }),
    })
  })

  const linked = !!(linkedKey || linkedPreset)

  useEffect(() => {
    if (!linked || loading) {
      return
    }
    const timeout = setTimeout(openLinked, LINKED_OPEN_DELAY)

    return () => clearTimeout(timeout)
  }, [linked, loading])

  const snapshot = inspected.item
  const liveItem =
    snapshot &&
    (items.find((item) => getKey(item) === getKey(snapshot)) ?? snapshot)

  return {
    close: () => setInspected((current) => ({ ...current, open: false })),
    inspected,
    item: liveItem,
    open,
  }
}
