import { FolderOpenIcon } from '@hugeicons/core-free-icons'
import { DEFAULT_PORTS } from '@tamery/connection/connection-parts'
import { isLocalHost } from '@tamery/connection/hosts'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { FieldGroup } from '@tamery/ui/components/field'

import { useBridgeRoute } from '~/core/runtime/bridge/pairing'
import { posthog } from '~/lib/posthog'

import type {
  ConnectionForm,
  ConnectionFormValues,
} from '../lib/connection-form'
import { getEngineFields, getFileType } from '../lib/engine-fields'
import { EngineField } from './engine-field'
import { Footnote } from './footnote'
import { TextRow } from './text-row'

export const ConnectionFields = ({
  form,
  locked,
  values,
}: {
  form: ConnectionForm
  locked: (field: string) => boolean
  values: Pick<ConnectionFormValues, 'host' | 'provider' | 'type'>
}) => {
  const fileType = getFileType(values)
  const bridge = useBridgeRoute(null)

  return (
    <>
      <FieldGroup variant="card">
        <EngineField form={form} locked={locked} />
        {getEngineFields(values).rows.map(
          ({ label, name, placeholder, port, secret }) => (
            <TextRow
              key={name}
              form={form}
              locked={locked}
              label={label}
              name={name}
              placeholder={placeholder}
              secret={secret}
              autoComplete={secret ? 'new-password' : 'off'}
              port={
                port && {
                  label: 'Port',
                  name: 'port',
                  placeholder: String(DEFAULT_PORTS[values.type] ?? 'Optional'),
                }
              }
            >
              {fileType && window.electron && (
                <IconButton
                  variant="ghost-faint"
                  size="icon-sm"
                  icon={FolderOpenIcon}
                  label="Choose file"
                  disabled={locked(name)}
                  onClick={async () => {
                    const path =
                      await window.electron?.databaseFile.pick(fileType)
                    if (path) {
                      posthog.capture('connection_file_picked')
                      form.setFieldValue(name, path)
                    }
                  }}
                />
              )}
            </TextRow>
          )
        )}
      </FieldGroup>
      {bridge && !fileType && isLocalHost(values.host.trim()) && (
        <Footnote>
          Local databases are reached from the bridge on{' '}
          <span data-mask>{bridge.name}</span>.
        </Footnote>
      )}
      {fileType && !window.electron && (
        <Footnote>
          {bridge ? (
            <>
              The file opens on <span data-mask>{bridge.name}</span>, the
              computer running your bridge.
            </>
          ) : (
            <>
              The file opens on the computer running{' '}
              <InlineCode>tamery bridge</InlineCode>.
            </>
          )}
        </Footnote>
      )}
    </>
  )
}
