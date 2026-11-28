import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Questionnaire as QuestionnairePrimitive } from '@shadcn/react/questionnaire'
import type { Button } from '@tamery/ui/components/button'
import { buttonVariants } from '@tamery/ui/components/button.utils'
import { cn } from '@tamery/ui/lib/utils'
import type * as React from 'react'

type NavigationProps = Pick<
  React.ComponentProps<typeof Button>,
  'size' | 'variant'
>

const Questionnaire = ({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Root>) => (
  <QuestionnairePrimitive.Root
    data-slot="questionnaire"
    className={cn('flex w-full min-w-0 flex-col gap-4', className)}
    {...props}
  />
)

const QuestionnaireProgress = ({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Progress>) => (
  <QuestionnairePrimitive.Progress
    data-slot="questionnaire-progress"
    className={cn(
      'text-muted-foreground min-h-lh w-fit text-xs tabular-nums',
      className
    )}
    {...props}
  />
)

const QuestionnaireItem = ({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Item>) => (
  <QuestionnairePrimitive.Item
    data-slot="questionnaire-item"
    className={cn(
      'flex min-w-0 flex-col gap-3 border-0 p-0 outline-none',
      className
    )}
    {...props}
  />
)

// A legend sits outside its fieldset's flex gap, so a title with no description below spaces itself.
const QuestionnaireTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Title>) => (
  <QuestionnairePrimitive.Title
    data-slot="questionnaire-title"
    className={cn(
      'text-sm font-medium text-pretty [&:not(:has(~[data-slot=questionnaire-description]))]:mb-3',
      className
    )}
    {...props}
  />
)

const QuestionnaireDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Description>) => (
  <QuestionnairePrimitive.Description
    data-slot="questionnaire-description"
    className={cn('text-muted-foreground text-xs text-pretty', className)}
    {...props}
  />
)

const QuestionnaireChoices = ({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choices>) => (
  <QuestionnairePrimitive.Choices
    data-slot="questionnaire-choices"
    className={cn('grid min-w-0 gap-1.5', className)}
    {...props}
  />
)

const QuestionnaireChoice = ({
  children,
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choice>) => (
  <QuestionnairePrimitive.Choice
    data-slot="questionnaire-choice"
    className={cn(
      'group/questionnaire-choice bg-input ring-foreground/4 hover:ring-foreground/12 has-[>input:focus-visible]:focus-ring data-invalid:invalid-ring data-checked:bg-primary/10 data-checked:ring-primary/40 relative flex min-h-8 cursor-default items-start gap-2.5 rounded-xl px-3 py-1.5 text-start text-sm shadow-xs ring transition-[background-color,box-shadow] outline-none select-none',
      'data-disabled:pointer-events-none data-disabled:opacity-50',
      className
    )}
    {...props}
  >
    <QuestionnairePrimitive.ChoiceInput
      data-slot="questionnaire-choice-input"
      className="absolute inset-0 z-10 size-full cursor-default opacity-0"
    />
    <span
      aria-hidden="true"
      data-slot="questionnaire-choice-indicator"
      className="bg-background ring-foreground/20 group-data-checked/questionnaire-choice:bg-primary group-data-checked/questionnaire-choice:text-primary-foreground group-data-checked/questionnaire-choice:ring-primary pointer-events-none mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-md ring group-data-[type=radio]/questionnaire-choice:rounded-full"
    >
      <span
        data-slot="questionnaire-choice-indicator-dot"
        className="bg-primary-foreground hidden size-1.5 rounded-full group-data-checked/questionnaire-choice:block group-data-[type=checkbox]/questionnaire-choice:hidden"
      />
      <HugeiconsIcon
        icon={Tick02Icon}
        strokeWidth={2}
        data-slot="questionnaire-choice-indicator-check"
        className="hidden size-3.5 group-data-checked/questionnaire-choice:block group-data-[type=radio]/questionnaire-choice:hidden"
      />
    </span>
    <QuestionnairePrimitive.ChoiceLabel
      data-slot="questionnaire-choice-label"
      className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug"
    >
      {children}
    </QuestionnairePrimitive.ChoiceLabel>
    <QuestionnairePrimitive.ChoiceShortcut
      data-slot="questionnaire-choice-shortcut"
      className="text-muted-foreground text-2xs pointer-events-none ms-auto mt-0.5 hidden size-4 shrink-0 items-center justify-center rounded-md font-mono leading-none group-data-shortcut/questionnaire-choice:inline-flex"
    />
  </QuestionnairePrimitive.Choice>
)

const QuestionnaireChoiceDescription = ({
  className,
  ...props
}: React.ComponentProps<'span'>) => (
  <span
    data-slot="questionnaire-choice-description"
    className={cn('text-muted-foreground text-xs', className)}
    {...props}
  />
)

const QuestionnaireInput = ({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Input>) => (
  <QuestionnairePrimitive.Input
    data-slot="questionnaire-input"
    className={cn(
      'bg-input ring-foreground/4 placeholder:text-muted-foreground focus-visible:focus-ring aria-invalid:invalid-ring h-8 w-full min-w-0 rounded-xl border border-transparent px-3 py-1 text-sm shadow-xs ring transition-shadow duration-200 outline-none disabled:pointer-events-none disabled:opacity-50',
      className
    )}
    {...props}
  />
)

const QuestionnaireError = ({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Error>) => (
  <QuestionnairePrimitive.Error
    data-slot="questionnaire-error"
    className={cn('text-destructive text-xs', className)}
    {...props}
  />
)

const QuestionnaireActions = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="questionnaire-actions"
    className={cn(
      'grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2',
      className
    )}
    {...props}
  />
)

const QuestionnairePrevious = ({
  children,
  className,
  size = 'sm',
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Previous> &
  NavigationProps) => (
  <QuestionnairePrimitive.Previous
    data-slot="questionnaire-previous"
    className={cn(
      buttonVariants({ size, variant }),
      'col-start-1 row-start-1 justify-self-start',
      className
    )}
    {...props}
  >
    {children ?? 'Previous'}
  </QuestionnairePrimitive.Previous>
)

const QuestionnaireSkip = ({
  children,
  className,
  size = 'sm',
  variant = 'ghost-muted',
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Skip> &
  NavigationProps) => (
  <QuestionnairePrimitive.Skip
    data-slot="questionnaire-skip"
    className={cn(
      buttonVariants({ size, variant }),
      'col-start-2 row-start-1 justify-self-end',
      className
    )}
    {...props}
  >
    {children ?? 'Skip'}
  </QuestionnairePrimitive.Skip>
)

const QuestionnaireNext = ({
  children,
  className,
  size = 'sm',
  variant = 'default',
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Next> &
  NavigationProps) => (
  <QuestionnairePrimitive.Next
    data-slot="questionnaire-next"
    className={cn(
      buttonVariants({ size, variant }),
      'col-start-3 row-start-1 justify-self-end',
      className
    )}
    {...props}
  >
    {children ?? 'Next'}
  </QuestionnairePrimitive.Next>
)

const QuestionnaireSubmit = ({
  children,
  className,
  size = 'sm',
  variant = 'default',
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Submit> &
  NavigationProps) => (
  <QuestionnairePrimitive.Submit
    data-slot="questionnaire-submit"
    className={cn(
      buttonVariants({ size, variant }),
      'col-start-3 row-start-1 justify-self-end',
      className
    )}
    {...props}
  >
    {children ?? 'Submit'}
  </QuestionnairePrimitive.Submit>
)

export {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
}
