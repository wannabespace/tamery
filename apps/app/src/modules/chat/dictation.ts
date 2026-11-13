import { DICTATION } from '@tamery/ai/limits'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { orpc } from '~/lib/orpc'

const writeAscii = (view: DataView, offset: number, text: string) => {
  for (const [index, char] of [...text].entries()) {
    view.setUint8(offset + index, char.codePointAt(0) ?? 0)
  }
}

// OpenRouter takes no WebM, the only audio Chromium records, so the recording is resampled into 16-bit mono WAV.
const toWav = async (recording: Blob) => {
  const context = new AudioContext()
  const decoded = await context
    .decodeAudioData(await recording.arrayBuffer())
    .finally(() => context.close())
  const rate = DICTATION.sampleRate
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * rate),
    rate
  )
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  const samples = rendered.getChannelData(0)

  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(view, 8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (const [index, sample] of samples.entries()) {
    view.setInt16(
      44 + index * 2,
      Math.max(-1, Math.min(1, sample)) * 0x7f_ff,
      true
    )
  }
  return new File([view], 'dictation.wav', { type: 'audio/wav' })
}

const stopRecording = (media: MediaRecorder | null) => {
  if (media?.state === 'recording') {
    media.stop()
  }
}

/** Records the microphone until `stop`, then hands the transcript to `onText`; `cancel` drops the recording. Stops by itself at the length the API takes. */
export const useDictation = (onText: (text: string) => void) => {
  const recorder = useRef<MediaRecorder | null>(null)
  const kept = useRef(true)
  const [isRecording, setIsRecording] = useState(false)
  const transcribe = useMutation({
    meta: { event: 'ai_chat_dictated' },
    mutationFn: async (recording: Blob) =>
      orpc.ai.transcribe.call({ audio: await toWav(recording) }),
    onSuccess: (text) => {
      if (text) {
        onText(text)
      }
    },
  })

  useEffect(
    () => () => {
      kept.current = false
      stopRecording(recorder.current)
    },
    []
  )

  const start = async () => {
    const stream = await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .catch(() => null)
    if (!stream) {
      toast.error("Tamery can't use the microphone", {
        description: 'Allow microphone access for Tamery, then try again.',
      })
      return
    }
    const media = new MediaRecorder(stream)
    const chunks: Blob[] = []
    const limit = setTimeout(
      () => stopRecording(media),
      DICTATION.seconds * 1000
    )
    media.addEventListener('dataavailable', (event) => chunks.push(event.data))
    media.addEventListener('stop', () => {
      clearTimeout(limit)
      for (const track of stream.getTracks()) {
        track.stop()
      }
      recorder.current = null
      setIsRecording(false)
      if (kept.current) {
        transcribe.mutate(new Blob(chunks, { type: media.mimeType }))
      }
    })
    kept.current = true
    recorder.current = media
    media.start()
    setIsRecording(true)
  }

  return {
    cancel: () => {
      kept.current = false
      stopRecording(recorder.current)
    },
    isRecording,
    isTranscribing: transcribe.isPending,
    start,
    stop: () => stopRecording(recorder.current),
  }
}
