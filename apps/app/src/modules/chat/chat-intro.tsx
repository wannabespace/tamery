import { useConnectionContext } from '~/core/connection/route'

/** The empty chat's heading, above the composer. */
export const ChatIntro = () => {
  const { connectionResource } = useConnectionContext()

  return (
    <div className="flex flex-col items-center gap-1.5 px-4 pb-4 text-center">
      <h2 className="text-xl font-medium tracking-tight text-balance">
        What should we look into?
      </h2>
      <p className="text-muted-foreground text-sm text-balance">
        Query <span data-mask>{connectionResource.name}</span>, change it, or @
        another connection to compare.
      </p>
    </div>
  )
}
