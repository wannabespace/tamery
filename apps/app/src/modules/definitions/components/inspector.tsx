import type { Dialect } from '@tamery/shared/enums/connection-type'
import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { MotionCollapse } from '@tamery/ui/components/collapse.motion'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@tamery/ui/components/drawer'
import { FieldDescription, FieldGroup } from '@tamery/ui/components/field'
import { Form, formContext } from '@tamery/ui/components/tanstack-form'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import type { AnyFormApi } from '@tanstack/react-form'
import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence } from 'motion/react'
import type { ReactNode } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useConnectionContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { getQueryLanguage } from '~/core/runtime/language'

import type { DefinitionsState } from '../hooks/use-definitions-state'

export interface InspectorWarning {
  action: string
  description: ReactNode
}

const FORM_ID = 'definition-inspector'

export type SectionInspectorProps<T> = DefinitionsState & {
  item: T | null
  onOpenChange: (open: boolean) => void
  preset?: string
  queryKey: QueryKey
}

export const Inspector = ({
  canSave,
  children,
  description,
  form,
  item,
  mutation,
  noun,
  readOnly,
  saveLabel,
  warning,
}: {
  canSave: boolean
  children: ReactNode
  description: string
  form: AnyFormApi
  item: { name: string } | null
  mutation: { error: Error | null; isPending: boolean }
  noun: string
  readOnly: boolean
  saveLabel?: string
  warning?: InspectorWarning | undefined
}) => {
  const saveEnabled = !(readOnly || mutation.isPending) && canSave

  useShortcut('submit', () => form.handleSubmit(), {
    enabled: saveEnabled,
    preventDefault: true,
  })

  const saveButton = (
    <Button
      type="submit"
      form={FORM_ID}
      variant={warning ? 'warning' : 'default'}
      disabled={!saveEnabled}
    >
      <LoadingContent loading={mutation.isPending}>
        {warning?.action ?? saveLabel ?? (item ? 'Save' : `Create ${noun}`)}
      </LoadingContent>
    </Button>
  )

  return (
    <>
      <DrawerHeader showCloseButton>
        <DrawerTitle data-mask className="truncate">
          {item ? item.name : `New ${noun}`}
        </DrawerTitle>
        <DrawerDescription data-mask className="truncate">
          {description}
        </DrawerDescription>
      </DrawerHeader>
      <formContext.Provider value={form}>
        <Form
          id={FORM_ID}
          form={form}
          className="scroll-fade no-scrollbar flex min-h-0 flex-1 flex-col divide-y overflow-y-auto"
        >
          {children}
        </Form>
      </formContext.Provider>
      <AnimatePresence initial={false}>
        {mutation.error && (
          <MotionCollapse key="error" className="shrink-0">
            <Alert variant="destructive" className="mx-3 mb-3 w-auto">
              <AlertDescription data-mask className="wrap-break-word">
                {mutation.error.message}
              </AlertDescription>
            </Alert>
          </MotionCollapse>
        )}
      </AnimatePresence>
      <DrawerFooter>
        <DrawerClose render={<Button variant="outline" className="ml-auto" />}>
          {readOnly ? 'Close' : 'Cancel'}
        </DrawerClose>
        {!readOnly && (
          <Tooltip shortcut={saveEnabled && <ShortcutKbd shortcut="submit" />}>
            <TooltipTrigger render={saveButton} />
            <TooltipContent>
              {warning && (
                <span className="block text-pretty">{warning.description}</span>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </DrawerFooter>
    </>
  )
}

export const replaceWarning = ({
  dialect,
  name,
  noun,
}: {
  dialect: Dialect
  name: string
  noun: string
}): InspectorWarning | undefined =>
  getCapabilities(dialect).flags.includes('ddlRollback')
    ? undefined
    : {
        action: `Replace ${noun}`,
        description: (
          <>
            This database cannot roll DDL back, so{' '}
            {getCapabilities(dialect).flags.includes('replacesInPlace')
              ? 'saving overwrites'
              : 'we drop'}{' '}
            <span data-mask className="font-medium">
              {name}
            </span>{' '}
            {getCapabilities(dialect).flags.includes('replacesInPlace')
              ? 'in place'
              : 'and create it again'}
            . If the new statement fails, we recreate the old one from its saved
            definition.
          </>
        ),
      }

export const InspectorSection = ({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: ReactNode
  children: ReactNode
  className?: string
  description?: string
  title: string
}) => (
  <section className={cn('flex flex-col gap-3 p-4', className)}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-col gap-1">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {title}
        </h3>
        {description && (
          <FieldDescription size="sm">{description}</FieldDescription>
        )}
      </div>
      {action}
    </div>
    <FieldGroup size="sm" className="min-h-0 flex-1">
      {children}
    </FieldGroup>
  </section>
)

export const InspectorDefinition = ({ code }: { code: string }) => {
  const { dialect } = useConnectionContext()
  const { highlight, name } = getQueryLanguage(dialect)
  return (
    <InspectorSection
      title={name}
      description="How the database defines this object today. Read-only."
      action={
        <CopyIconButton
          label={`Copy ${name}`}
          side="left"
          className="-mt-0.5"
          text={code}
        />
      }
    >
      <CodeBlock
        code={code}
        language={highlight}
        size="xs"
        variant="field"
        wrap
      />
    </InspectorSection>
  )
}

export const InspectorSql = ({
  query,
}: {
  query: UseQueryOptions<string, Error, string, string[]>
}) => {
  const { data: definition } = useQuery(query)

  return definition ? <InspectorDefinition code={definition} /> : null
}
