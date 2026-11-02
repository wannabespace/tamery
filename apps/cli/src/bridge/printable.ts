const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu

export const printable = (text: string) =>
  text.replaceAll(CONTROL_CHARACTERS, '')
