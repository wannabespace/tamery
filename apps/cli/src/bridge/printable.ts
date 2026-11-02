const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu

/** Text a browser sent, made safe to print: a control character could rewrite what the terminal shows the user. */
export const printable = (text: string) =>
  text.replaceAll(CONTROL_CHARACTERS, '')
