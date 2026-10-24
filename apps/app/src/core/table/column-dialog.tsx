import type { Dialect } from '@tamery/shared/enums/connection-type'
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@tamery/ui/components/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@tamery/ui/components/input-group'
import { Switch } from '@tamery/ui/components/switch'
import { useState } from 'react'

import { OptionField } from '~/components/option-field'
import { getCapabilities } from '~/core/catalog/capabilities'
import { submittedName } from '~/core/catalog/engine-name'
import { useConnectionContext } from '~/core/connection/route'
import type { RenamedValue } from '~/core/queries/shared/inline-enum'

import { CommentField } from './column-comment-field'
import { ReferenceField } from './column-reference-field'
import { TypeField } from './column-type-field'
import type {
  EditableColumn,
  EditableTable,
  SubmittedColumn,
} from './submitted-column'
import { changed, getErrors, normalized } from './submitted-column'
import { useColumnType } from './use-column-type'
import type { ColumnReference, ReferenceTarget } from './use-reference-targets'

export interface ColumnDialogRequest<
  Table extends EditableTable = EditableTable,
  Column extends EditableColumn = EditableColumn,
> {
  column: Column | null
  table: Table
}

const FORM_ID = 'column-dialog'

const lockedFields = (
  dialect: Dialect,
  column: EditableColumn | null,
  primaryKey: boolean
) => {
  const { flags } = getCapabilities(dialect)
  const alterColumns = flags.includes('alterColumns')
  const renameColumns = flags.includes('renameColumns')
  const retypeKeyColumns = flags.includes('retypeKeyColumns')
  const stored = column !== null && column.state !== 'added'
  const name = stored && !renameColumns
  const type =
    stored && (!alterColumns || (!!column.primaryKey && !retypeKeyColumns))
  return {
    focusType: name && !type,
    name,
    nameOnly: stored && renameColumns && !alterColumns,
    nullable: primaryKey || (stored && !alterColumns),
    type,
  }
}

const editableComment = (dialect: Dialect, column: EditableColumn | null) =>
  getCapabilities(dialect).flags.includes('comments')
    ? column?.comment
    : undefined

const ColumnForm = ({
  onSubmit,
  pending,
  request,
}: {
  onSubmit: (
    column: SubmittedColumn,
    reference: ColumnReference | null,
    renamedValues: RenamedValue[]
  ) => void
  pending: boolean
  request: ColumnDialogRequest
}) => {
  const { column, table } = request
  const { dialect } = useConnectionContext()
  const [name, setName] = useState(column?.name ?? '')
  const columnType = useColumnType(dialect, column?.type ?? '')
  const {
    array,
    arrayType,
    element,
    enumValues,
    renamedValues,
    setArray,
    setElement,
  } = columnType
  const [reference, setReference] = useState<ReferenceTarget | null>(null)
  const [nullable, setNullable] = useState(column?.nullable ?? true)
  const [primaryKey, setPrimaryKey] = useState(column?.primaryKey ?? false)
  const [comment, setComment] = useState(() => editableComment(dialect, column))
  const [submitted, setSubmitted] = useState(false)
  const locked = lockedFields(dialect, column, primaryKey)
  const next = normalized(column, {
    comment,
    name: submittedName(dialect, name, column),
    nullable,
    primaryKey,
    type: columnType.type,
  })
  const errors = getErrors(request, next, enumValues, submitted)

  return (
    <>
      <DialogHeader>
        <DialogTitle>{column ? 'Edit column' : 'Add column'}</DialogTitle>
        <DialogDescription data-mask>
          {column ? `${table.name}.${column.name}` : table.name}
        </DialogDescription>
      </DialogHeader>
      <form
        id={FORM_ID}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
          const refused = getErrors(request, next, enumValues, true)
          if (!refused.name && !refused.type && !refused.values) {
            onSubmit(next, reference, renamedValues)
          }
        }}
      >
        <Field>
          <FieldLabel htmlFor="column-dialog-name">Name</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="column-dialog-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
              autoFocus={!locked.name}
              disabled={locked.name}
              spellCheck={false}
              autoComplete="off"
              data-mask
            />
            <InputGroupAddon align="inline-end">
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </InputGroupAddon>
          </InputGroup>
        </Field>
        {locked.nameOnly && (
          <FieldDescription>
            This database can only rename a stored column.
          </FieldDescription>
        )}
        <TypeField
          autoFocus={locked.focusType}
          columnType={columnType}
          disabled={locked.type}
          error={errors.type}
          valuesError={errors.values}
        />
        <ReferenceField
          column={column}
          value={reference}
          onValueChange={(target) => {
            setReference(target)
            if (target && !element.trim()) {
              setElement(target.type)
            }
          }}
        />
        {comment !== undefined && (
          <CommentField value={comment} onValueChange={setComment} />
        )}
        {column === null && table.state === 'added' && (
          <OptionField
            htmlFor="column-dialog-primary-key"
            title="Primary key"
            description="Identifies each row, so it never holds NULL."
          >
            <Switch
              id="column-dialog-primary-key"
              size="sm"
              checked={primaryKey}
              onCheckedChange={setPrimaryKey}
            />
          </OptionField>
        )}
        <OptionField
          htmlFor="column-dialog-nullable"
          title="Allow NULL"
          description="Rows may leave this column empty."
        >
          <Switch
            id="column-dialog-nullable"
            size="sm"
            checked={next.nullable}
            disabled={locked.nullable}
            onCheckedChange={setNullable}
          />
        </OptionField>
        {arrayType && (
          <OptionField
            htmlFor="column-dialog-array"
            title="Array"
            description="Each value is a list of the type above."
          >
            <Switch
              id="column-dialog-array"
              size="sm"
              checked={array}
              onCheckedChange={setArray}
            />
          </OptionField>
        )}
      </form>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button
          type="submit"
          form={FORM_ID}
          disabled={pending || !changed(column, next, reference)}
        >
          <LoadingContent loading={pending}>
            {column ? 'Save' : 'Add column'}
          </LoadingContent>
        </Button>
      </DialogFooter>
    </>
  )
}

export const ColumnDialog = <
  Table extends EditableTable,
  Column extends EditableColumn,
>({
  onOpenChange,
  onSubmit,
  pending = false,
  request,
}: {
  onOpenChange: (open: boolean) => void
  onSubmit: (
    request: ColumnDialogRequest<Table, Column>,
    column: SubmittedColumn,
    reference: ColumnReference | null,
    renamedValues: RenamedValue[]
  ) => void
  pending?: boolean
  request: ColumnDialogRequest<Table, Column> | null
}) => {
  const [shown, setShown] = useState(request)
  if (request && request !== shown) {
    setShown(request)
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(open) => {
        if (!open) {
          setShown(null)
        }
      }}
    >
      <DialogContent>
        {shown && (
          <ColumnForm
            key={`${shown.table.name}:${shown.column?.id ?? ''}`}
            pending={pending}
            request={shown}
            onSubmit={(column, reference, renamedValues) =>
              onSubmit(shown, column, reference, renamedValues)
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
