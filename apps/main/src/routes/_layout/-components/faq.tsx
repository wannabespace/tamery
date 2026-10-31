import { SOCIAL_LINKS } from '@tamery/shared/constants'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tamery/ui/components/accordion'

import { Chapter } from '~/components/chapter'
import { Reveal } from '~/components/reveal'

import { FAQ_QUESTIONS } from './faq-questions'

export const Faq = () => (
  <Chapter
    id="faq"
    label="FAQ"
    title="Questions."
    description={
      <>
        Anything else? Ask us on{' '}
        <a
          href={SOCIAL_LINKS.DISCORD}
          target="_blank"
          rel="noopener noreferrer"
        >
          Discord
        </a>
        .
      </>
    }
  >
    <Reveal className="mt-12">
      <Accordion>
        {FAQ_QUESTIONS.map(({ answer, question }) => (
          <AccordionItem key={question} value={question}>
            <AccordionTrigger>{question}</AccordionTrigger>
            <AccordionContent>{answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Reveal>
  </Chapter>
)
