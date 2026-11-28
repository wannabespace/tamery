import { Button } from '@tamery/ui/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useState } from 'react'

import { renameChat } from './rename-chat'

const FORM_ID = 'rename-chat-form'

const RenameChatForm = ({
  chat,
  onDone,
}: {
  chat: { id: string; title: string }
  onDone: VoidFunction
}) => {
  const [title, setTitle] = useState(chat.title)
  const next = title.trim()

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename chat</DialogTitle>
        <DialogDescription data-mask>{chat.title}</DialogDescription>
      </DialogHeader>
      <form
        id={FORM_ID}
        onSubmit={(event) => {
          event.preventDefault()
          renameChat(chat.id, next)
          onDone()
        }}
      >
        <Field>
          <FieldLabel htmlFor="rename-chat-name">Name</FieldLabel>
          <Input
            id="rename-chat-name"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            autoComplete="off"
            data-mask
          />
        </Field>
      </form>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button
          type="submit"
          form={FORM_ID}
          disabled={!next || next === chat.title}
        >
          Rename
        </Button>
      </DialogFooter>
    </>
  )
}

export const RenameChatDialog = ({
  chat,
  onOpenChange,
  open,
}: {
  /** Kept after closing, so the form stays in place while the dialog animates out. */
  chat: { id: string; title: string } | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      {chat && (
        <RenameChatForm
          key={chat.id}
          chat={chat}
          onDone={() => onOpenChange(false)}
        />
      )}
    </DialogContent>
  </Dialog>
)
