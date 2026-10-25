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
    className="mx-auto grid max-w-6xl scroll-mt-24 gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_2fr]"
  >
    <Reveal>
      <SectionHeading id="faq-heading" eyebrow="FAQ" title="Questions.">
        Anything else? Ask us on{' '}
        <a
          href={SOCIAL_LINKS.DISCORD}
          target="_blank"
          rel="noopener noreferrer"
        >
          Discord
        </a>
        .
      </SectionHeading>
    </Reveal>
    <Reveal>
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
