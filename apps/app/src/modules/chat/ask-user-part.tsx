import { HelpCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChatTools } from '@tamery/ai/tools'
import {
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
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from '@tamery/ui/components/questionnaire'

import { posthog } from '~/lib/posthog'
import { plural } from '~/utils/plural'

import { ChatDisclosure } from './chat-disclosure'
import type { ChatToolPart, ToolPartActions } from './chat-tool-types'
import { ToolCard, ToolCardHeader } from './tool-card'

type AskPart = Extract<ChatToolPart, { type: 'tool-ask_user' }>
type Questions = ChatTools['ask_user']['input']['questions']

const fieldName = (index: number) => `question-${index}`

const readAnswers = (form: HTMLFormElement, questions: Questions) => {
  const data = new FormData(form)
  return questions.map((question, index) => ({
    answer: data
      .getAll(fieldName(index))
      .map((value) => String(value).trim())
      .filter(Boolean),
    question: question.question,
  }))
}

const QuestionsForm = ({
  answer,
  questions,
  toolCallId,
}: {
  answer: NonNullable<ToolPartActions['decide']>['answer']
  questions: Questions
  toolCallId: string
}) => (
  <ToolCard>
    <ToolCardHeader
      icon={<HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} />}
      title={
        questions.length === 1
          ? 'A question for you'
          : `${questions.length} questions for you`
      }
    />
    <div className="p-3">
      <Questionnaire
        onSubmit={(event) => {
          event.preventDefault()
          const answers = readAnswers(event.currentTarget, questions)
          posthog.capture('ai_chat_questions_answered', {
            own: answers.filter(({ answer: chosen }, index) =>
              chosen.some(
                (value) =>
                  !questions[index]?.options.some(
                    ({ label }) => label === value
                  )
              )
            ).length,
            questions: questions.length,
          })
          answer({ output: { answers }, toolCallId })
        }}
      >
        {questions.length > 1 && <QuestionnaireProgress />}
        {questions.map((question, index) => (
          <QuestionnaireItem
            key={index}
            name={fieldName(index)}
            multiple={question.multiple}
            required
          >
            <QuestionnaireTitle>{question.question}</QuestionnaireTitle>
            {question.description && (
              <QuestionnaireDescription>
                {question.description}
              </QuestionnaireDescription>
            )}
            <QuestionnaireChoices>
              {question.options.map((option) => (
                <QuestionnaireChoice key={option.label} value={option.label}>
                  {option.label}
                  {option.description && (
                    <QuestionnaireChoiceDescription>
                      {option.description}
                    </QuestionnaireChoiceDescription>
                  )}
                </QuestionnaireChoice>
              ))}
              <QuestionnaireInput
                aria-label="Your own answer"
                placeholder="Your own answer"
                autoComplete="off"
              />
            </QuestionnaireChoices>
            <QuestionnaireError />
          </QuestionnaireItem>
        ))}
        <QuestionnaireActions>
          <QuestionnairePrevious />
          <QuestionnaireNext />
          <QuestionnaireSubmit>Answer</QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
    </div>
  </ToolCard>
)

/** The agent's questions: a form while they wait for the user, then a line that opens what was answered. */
export const AskUserPart = ({
  actions,
  part,
}: {
  actions: ToolPartActions
  part: AskPart
}) => {
  if (part.state === 'input-available' && actions.decide) {
    return (
      <QuestionsForm
        answer={actions.decide.answer}
        questions={part.input.questions}
        toolCallId={part.toolCallId}
      />
    )
  }
  if (part.state === 'input-streaming') {
    return <ChatDisclosure icon={HelpCircleIcon} label="Asking you" live />
  }
  if (part.state === 'output-error') {
    return (
      <ChatDisclosure
        icon={HelpCircleIcon}
        label="Couldn't ask you"
        status={<span className="text-destructive">Failed</span>}
      >
        <p className="text-destructive text-xs whitespace-pre-wrap">
          {part.errorText}
        </p>
      </ChatDisclosure>
    )
  }
  if (part.state !== 'output-available') {
    return (
      <ChatDisclosure
        icon={HelpCircleIcon}
        label="Asked you"
        status={<span className="text-muted-foreground">Not answered</span>}
      >
        <dl className="flex flex-col gap-2 text-xs">
          {part.input.questions.map((question, index) => (
            <div key={index}>
              <dt>{question.question}</dt>
              <dd className="text-muted-foreground">
                {question.options.map(({ label }) => label).join(' · ')}
              </dd>
            </div>
          ))}
        </dl>
      </ChatDisclosure>
    )
  }
  return (
    <ChatDisclosure
      icon={HelpCircleIcon}
      label={`You answered ${plural(part.output.answers.length, 'question')}`}
    >
      <dl className="flex flex-col gap-2 text-xs">
        {part.output.answers.map(({ answer, question }, index) => (
          <div key={index}>
            <dt className="text-muted-foreground">{question}</dt>
            <dd>{answer.join(', ') || 'Skipped'}</dd>
          </div>
        ))}
      </dl>
    </ChatDisclosure>
  )
}
