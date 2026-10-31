import { SOCIAL_LINKS } from '@tamery/shared/constants'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tamery/ui/components/accordion'

import { Reveal } from '~/components/reveal'
import { SectionHeading } from '~/components/section-heading'

import { FAQ_QUESTIONS } from './faq-questions'

export const Faq = () => (
  <section
    id="faq"
    aria-labelledby="faq-heading"
    className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24"
  >
    <Reveal>
      <SectionHeading
        id="faq-heading"
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
      />
    </Reveal>
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
  </section>
)
