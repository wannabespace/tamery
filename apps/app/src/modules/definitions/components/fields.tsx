import { FIELD_EDITOR_OPTIONS, Monaco } from '@tamery/monaco/editor'
import { QUERY_COMPLETION_OPTIONS } from '@tamery/monaco/query-language'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from '@tamery/ui/components/combobox'
import { FieldDescription } from '@tamery/ui/components/field'
import {
  Select,
  SelectContent,
  SelectEmpty,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import { Spinner } from '@tamery/ui/components/spinner'
import { Switch } from '@tamery/ui/components/switch'
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
  useFieldContext,
  useFormContext,
} from '@tamery/ui/components/tanstack-form'
import { cn } from '@tamery/ui/lib/utils'
import type { AnyFormApi } from '@tanstack/react-form'
import type * as monaco from 'monaco-editor'
import type { ComponentProps, ReactNode } from 'react'
import { useEffect, useRef } from 'react'

import { OptionField } from '~/components/option-field'
import { useConnectionContext } from '~/core/connection/route'
import { attachQuerySource } from '~/core/query-editor/query-source'

export const readOnlyEditorOptions = {
  ...FIELD_EDITOR_OPTIONS,
  readOnly: true,
} satisfies monaco.editor.IStandaloneEditorConstructionOptions

const identity = (value: string): string => value
const noOptions: readonly string[] = []

export const OptionSelect = <T extends string>({
  className,
  disabled,
  empty = 'Nothing to choose',
  id,
  getLabel = identity,
  mask = true,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  className?: string
  disabled?: boolean
  empty?: ReactNode
  id?: string
  getLabel?: (value: T) => string
  mask?: boolean
  onValueChange: (value: T) => void
  options: readonly T[]
  placeholder?: string
  value: T | ''
}) => (
  <Select
    value={value || null}
    disabled={disabled}
    onValueChange={(next) => {
      if (next) {
        onValueChange(next)
      }
    }}
  >
    <SelectTrigger
      id={id}
      // The trigger is a div, which `<label for>` cannot name; the form's `FieldLabel` has `${field.name}-label`.
      aria-labelledby={id && `${id}-label`}
      data-mask={mask || undefined}
      className={cn('w-full', className)}
    >
      <SelectValue placeholder={placeholder}>
        {(current: T | null) => (current ? getLabel(current) : placeholder)}
      </SelectValue>
    </SelectTrigger>
    <SelectContent data-mask={mask || undefined}>
      {options.length === 0 ? (
        <SelectEmpty>{empty}</SelectEmpty>
      ) : (
        options.map((option) => (
          <SelectItem key={option} value={option}>
            {getLabel(option)}
          </SelectItem>
        ))
      )}
    </SelectContent>
  </Select>
)

interface LabelledProps {
  description?: ReactNode
  label: string
}

export const Labelled = ({
  children,
  description,
  label,
}: LabelledProps & { children: ReactNode }) => (
  <Field>
    <FieldLabel>{label}</FieldLabel>
    {children}
    {description && <FieldDescription>{description}</FieldDescription>}
  </Field>
)

export const TextField = ({
  description,
  label,
  ...input
}: LabelledProps & ComponentProps<typeof FieldInput>) => (
  <Labelled description={description} label={label}>
    <FieldInput data-mask autoComplete="off" spellCheck={false} {...input} />
  </Labelled>
)

export const SqlField = ({
  description,
  label,
  ...textarea
}: LabelledProps & ComponentProps<typeof FieldTextarea>) => (
  <Labelled description={description} label={label}>
    <FieldTextarea
      data-mask
      // oxlint-disable-next-line shadcn/no-restyle -- SQL reads as code
      className="font-mono"
      spellCheck={false}
      {...textarea}
    />
  </Labelled>
)

export const BodyField = ({
  description,
  disabled,
  label,
  language,
}: LabelledProps & { disabled?: boolean; language: string }) => {
  const field = useFieldContext<string>()
  const form = useFormContext()
  const { connection, connectionResource, dialect } = useConnectionContext()
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  // Schema and AI ghost text, but no SQL diagnostics: a routine body is not a top-level statement.
  useEffect(() => {
    const codeEditor = disabled ? null : editorRef.current
    return codeEditor
      ? attachQuerySource(
          codeEditor,
          connectionResource,
          connection.type,
          dialect,
          {
            diagnostics: false,
          }
        )
      : undefined
  }, [disabled, connectionResource, connection.type, dialect])

  return (
    <Labelled description={description} label={label}>
      <Monaco
        data-mask
        className="ring-foreground/4 h-56 rounded-xl ring"
        language={language}
        ref={editorRef}
        value={field.state.value}
        options={{
          ...(disabled ? readOnlyEditorOptions : FIELD_EDITOR_OPTIONS),
          ...(disabled ? {} : QUERY_COMPLETION_OPTIONS),
          ariaLabel: label,
        }}
        onSubmit={disabled ? undefined : () => form.handleSubmit()}
        onChange={field.handleChange}
        leaveOnEscape
      />
    </Labelled>
  )
}

export const SelectField = <T extends string>({
  description,
  label,
  onChanged,
  ...select
}: LabelledProps & {
  disabled?: boolean
  empty?: ReactNode
  getLabel?: (value: T) => string
  onChanged?: (value: T) => void
  options: readonly T[]
  placeholder: string
}) => {
  const field = useFieldContext<T>()

  return (
    <Labelled description={description} label={label}>
      <OptionSelect
        id={field.name}
        value={field.state.value}
        onValueChange={(next) => {
          field.handleChange(next)
          onChanged?.(next)
        }}
        {...select}
      />
    </Labelled>
  )
}

export const OptionsField = ({
  description,
  disabled,
  label,
  limit,
  options,
  placeholder,
}: LabelledProps & {
  disabled?: boolean
  limit?: number
  options: readonly string[] | undefined
  placeholder: string
}) => {
  const field = useFieldContext<string[]>()
  const selected = field.state.value

  return (
    <Labelled description={description} label={label}>
      <Combobox
        multiple
        autoHighlight
        disabled={disabled}
        items={options ?? noOptions}
        value={selected}
        onValueChange={(next: string[]) => {
          if (limit === undefined || next.length <= limit) {
            field.handleChange(next)
          }
        }}
      >
        <ComboboxChips data-mask>
          <ComboboxValue>
            {(items: string[]) =>
              items.map((item) => (
                <ComboboxChip key={item} aria-label={item}>
                  {item}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput
            id={field.name}
            placeholder={selected.length > 0 ? undefined : placeholder}
          />
        </ComboboxChips>
        <ComboboxContent data-mask>
          <ComboboxEmpty>
            {options ? 'Nothing found.' : <Spinner />}
          </ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Labelled>
  )
}

export const SchemaField = ({
  disabled,
  onChanged,
  schemas,
}: {
  disabled: boolean
  onChanged?: (schema: string) => void
  schemas: string[]
}) =>
  schemas.length > 1 && (
    <SelectField
      disabled={disabled}
      label="Schema"
      options={schemas}
      placeholder="Choose a schema"
      onChanged={onChanged}
    />
  )

export const resetFields = (
  form: AnyFormApi,
  values: Record<string, unknown>
) => {
  for (const [name, value] of Object.entries(values)) {
    form.setFieldValue(name, value, { dontUpdateMeta: true })
    form.setFieldMeta(name, (meta) => ({ ...meta, isTouched: false }))
  }
}

export const SwitchField = ({
  description,
  disabled,
  title,
}: {
  description: string
  disabled: boolean
  title: string
}) => {
  const field = useFieldContext<boolean>()

  return (
    <OptionField htmlFor={field.name} title={title} description={description}>
      <Switch
        id={field.name}
        size="sm"
        disabled={disabled}
        checked={field.state.value}
        onCheckedChange={field.handleChange}
      />
    </OptionField>
  )
}
