import { FIELD_EDITOR_OPTIONS, Monaco } from '@tamery/monaco/editor'
import {
  MONGO_DOCUMENT_LANGUAGE,
  QUERY_COMPLETION_OPTIONS,
} from '@tamery/monaco/query-language'
import { parseScript } from '@tamery/mongo/parse'
import { newObjectId } from '@tamery/mongo/values'
import { uppercaseFirst } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { useMutation } from '@tanstack/react-query'
import type { editor } from 'monaco-editor'
import {
  createRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'

import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { insertDocumentQuery } from '~/core/queries/rows/insert-document'
import { resourceRowsQueryKey } from '~/core/queries/rows/list'
import { resourceTableTotalQueryKey } from '~/core/queries/rows/total'
import { resourceColumnsQueryKey } from '~/core/queries/tables/columns'
import { attachQuerySource } from '~/core/query-editor/query-source'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { queryClient } from '~/lib/query-client'

// Pre-fill a fresh _id like Compass does, so the inserted document has a stable key the user can see and edit.
const documentTemplate = () => `{\n  _id: ObjectId("${newObjectId()}")\n}`

const EDITOR_OPTIONS = {
  ...FIELD_EDITOR_OPTIONS,
  ...QUERY_COMPLETION_OPTIONS,
} satisfies editor.IStandaloneEditorConstructionOptions

const statementOf = (table: string, document: string) =>
  `db.getCollection(${JSON.stringify(table)}).insertOne(${document})`

export const insertDocumentRef = createRef<{ open: () => void }>()

export const InsertDocumentDialog = ({
  schema,
  table,
}: {
  schema: string
  table: string
}) => {
  const names = useObjectNames()
  const { connection, connectionResource, dialect } = useConnectionContext()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const [open, setOpen] = useState(false)
  const [document, setDocument] = useState(documentTemplate)
  const [error, setError] = useState<string | null>(null)

  // Binds the AI ghost-text source (completion + schema) to the editor; it reads the connection's collections and fields.
  useEffect(() => {
    const codeEditor = open ? editorRef.current : null
    return codeEditor
      ? attachQuerySource(
          codeEditor,
          connectionResource,
          connection.type,
          dialect
        )
      : undefined
  }, [open, connectionResource, connection.type, dialect])

  useImperativeHandle(insertDocumentRef, () => ({
    open: () => {
      setDocument(documentTemplate())
      setError(null)
      setOpen(true)
    },
  }))

  const { mutate, isPending } = useMutation({
    meta: { event: 'document_inserted' },
    mutationFn: async () => {
      parseScript(statementOf(table, document))
      await insertDocumentQuery({ document, table }).run(
        await connectionResourceToQueryParams(connectionResource)
      )
    },
    onError: (mutationError) => setError(mutationError.message),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: resourceRowsQueryKey({ connectionResource, schema, table }),
        }),
        queryClient.invalidateQueries({
          queryKey: resourceColumnsQueryKey({ connectionResource }),
        }),
        queryClient.invalidateQueries({
          queryKey: resourceTableTotalQueryKey({
            connectionResource,
            schema,
            table,
          }),
        }),
      ])
      toast.success(`${uppercaseFirst(names.row)} inserted`)
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Insert {names.row}</DialogTitle>
          <DialogDescription>
            Paste or type a {names.row}. Shell types like ObjectId(…) and
            ISODate(…) are kept as themselves.
          </DialogDescription>
        </DialogHeader>
        <div data-mask className="h-80 overflow-hidden rounded-xl border">
          <Monaco
            className="size-full"
            language={MONGO_DOCUMENT_LANGUAGE}
            leaveOnEscape
            onChange={setDocument}
            onSubmit={() => mutate()}
            options={EDITOR_OPTIONS}
            ref={editorRef}
            value={document}
          />
        </div>
        {error && (
          <p data-mask className="text-destructive text-xs">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={isPending} onClick={() => mutate()}>
            <LoadingContent loading={isPending}>
              Insert {names.row}
            </LoadingContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
