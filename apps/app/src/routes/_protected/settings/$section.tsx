import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'
import { type } from 'arktype'

import { settingsSections } from '~/core/settings/sections'
import { isAnonymous } from '~/lib/auth'

const { useLoaderData } = getRouteApi('/_protected/settings/$section')

const SettingsSectionPage = () => {
  const { component: Section } = useLoaderData()

  return <Section />
}

export const Route = createFileRoute('/_protected/settings/$section')({
  loader: ({ params }) => {
    const section = settingsSections.find(({ slug }) => slug === params.section)
    if (!section || (section.needsAccount && isAnonymous())) {
      throw notFound()
    }
    return section
  },
  component: SettingsSectionPage,
  validateSearch: type({
    'connect?': '"github" | "google"',
    'error?': 'string',
  }),
})
