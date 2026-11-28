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

/** A chat's files in the bucket, which the purge job deletes once its deleted copy expires. A chat's id is client-minted and may be taken again after a delete, so the prefix also holds the row's server-set creation time: a new chat under the same id never reaches the old files, nor the purge the new ones. */
export const chatAttachmentsPrefix = (chat: { createdAt: Date; id: string }) =>
  `chats/${chat.id}/${chat.createdAt.getTime()}/`
