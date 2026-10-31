import { pageSchema } from 'fumadocs-core/source/schema'
import { applyMdxPreset } from 'fumadocs-mdx/config'
import { defineDocs } from 'fumadocs-mdx/macro'
import { z } from 'zod'

export const docs = defineDocs({
  dir: '../../docs',
  docs: {
    async: true,
    files: ['**/*.mdx'],
    lastModified: true,
    // Shiki output hides each fence's language class; the kit's CodeBlock highlights instead.
    mdxOptions: applyMdxPreset({
      rehypeCodeOptions: false,
      // Without mdxJsxFlowElement: a `<Card href>` has no text, indexed it matches its href and shows as an empty result.
      remarkStructureOptions: {
        types: ['heading', 'paragraph', 'blockquote', 'table'],
      },
    }),
    schema: pageSchema.extend({
      keywords: z.array(z.string()).optional(),
      sidebarTitle: z.string().optional(),
    }),
  },
})
