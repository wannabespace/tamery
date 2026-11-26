const SCHEME = 'attachment:'

/** What a chat file part's `url` holds once its file lives in the attachments bucket. */
export const attachmentRef = (ref: { chatId: string; id: string }) =>
  `${SCHEME}${ref.chatId}/${ref.id}`

export const parseAttachmentRef = (url: string) => {
  if (!url.startsWith(SCHEME)) {
    return null
  }
  const [chatId, id] = url.slice(SCHEME.length).split('/')
  return chatId && id ? { chatId, id } : null
}

// The purge job deletes a chat's files by this prefix once its deleted copy expires.
export const chatAttachmentsPrefix = (chatId: string) => `chats/${chatId}/`

export const attachmentKey = (ref: { chatId: string; id: string }) =>
  `${chatAttachmentsPrefix(ref.chatId)}${ref.id}`
