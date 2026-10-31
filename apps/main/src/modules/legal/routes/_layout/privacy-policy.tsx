import { createFileRoute } from '@tanstack/react-router'

import { seo } from '~/utils/seo'

import privacyPolicyContent from '../../content/privacy-policy.md?raw'
import { LegalDocument } from '../../legal-document'

const PrivacyPolicy = () => (
  <LegalDocument
    title="Privacy Policy"
    updatedAt="October 28, 2026"
    content={privacyPolicyContent}
  />
)

export const Route = createFileRoute('/_layout/privacy-policy')({
  component: PrivacyPolicy,
  head: () =>
    seo({
      title: 'Privacy Policy - Tamery',
      description:
        'Learn how Tamery collects, uses, and protects your personal information. Read our privacy policy.',
      path: '/privacy-policy',
    }),
})
