import { createFileRoute } from '@tanstack/react-router'

import { seo } from '~/utils/seo'

import termsOfServiceContent from '../../content/terms-of-service.md?raw'
import { LegalDocument } from '../../legal-document'

const TermsOfService = () => (
  <LegalDocument
    title="Terms of Service"
    updatedAt="October 28, 2026"
    content={termsOfServiceContent}
  />
)

export const Route = createFileRoute('/_layout/terms-of-service')({
  component: TermsOfService,
  head: () =>
    seo({
      title: 'Terms of Service - Tamery',
      description:
        'Read the terms and conditions for using Tamery. Our terms of service outline your rights and responsibilities.',
      path: '/terms-of-service',
    }),
})
