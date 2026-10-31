import { AppLogo } from '@tamery/ui/components/brand/app-logo'
import { createFileRoute } from '@tanstack/react-router'
import { ImageResponse } from 'takumi-js/response'

import { findPost } from '../posts'

export const Route = createFileRoute('/blog/$slug/og.png')({
  server: {
    handlers: {
      GET: ({ params }) => {
        const post = findPost(params.slug)
        if (!post) {
          return new Response(null, { status: 404 })
        }

        // Colors copy the light theme of `@tamery/ui` globals.css: the renderer cannot read the kit's CSS variables.
        return new ImageResponse(
          <div tw="flex h-full w-full flex-col justify-between bg-[oklch(0.9651_0.0013_282.73)] p-18 text-[oklch(0.18_0_0)]">
            <div tw="flex items-center gap-4 text-4xl font-semibold tracking-tight">
              <AppLogo tw="size-11 text-[oklch(0.5788_0.2316_259.64)]" />
              Tamery
            </div>
            <div tw="flex flex-col gap-6">
              <div tw="flex">
                <div tw="rounded-full bg-[oklch(0.5788_0.2316_259.64/0.1)] px-5 py-2 text-2xl font-medium text-[oklch(0.5788_0.2316_259.64)]">
                  {post.engine}
                </div>
              </div>
              <div tw="text-7xl leading-[1.05] font-bold tracking-tight text-balance">
                {post.title}
              </div>
              <div tw="text-3xl leading-snug text-[oklch(0.55_0_0)]">
                {post.description}
              </div>
            </div>
          </div>,
          {
            headers: { 'Cache-Control': 'public, max-age=86400' },
            height: 630,
            width: 1200,
          }
        )
      },
    },
  },
})
