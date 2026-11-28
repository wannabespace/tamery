import { extractText, getDocumentProxy } from 'unpdf'

declare const self: Worker

/** A PDF's text, or null when it has more than `maxPages` pages or cannot be read. */
export type PdfText = { text: string; totalPages: number } | null

self.addEventListener(
  'message',
  async ({ data }: MessageEvent<{ bytes: Uint8Array; maxPages: number }>) => {
    const text = await getDocumentProxy(data.bytes)
      .then((document) =>
        document.numPages > data.maxPages
          ? null
          : extractText(document, { mergePages: true })
      )
      .catch(() => null)
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker, which takes no origin
    self.postMessage(text satisfies PdfText)
  }
)
