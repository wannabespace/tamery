import { posthog } from '~/lib/posthog'

export const MachineAddressDocs = () => (
  <a
    href={`${import.meta.env.VITE_PUBLIC_DOCS_URL}/cli/remote`}
    target="_blank"
    rel="noopener noreferrer"
    onClick={() => posthog.capture('machine_address_docs_opened')}
  >
    See how
  </a>
)
