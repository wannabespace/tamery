const authRegex =
  /^(?<protocol>[^:]+):\/\/(?<user>[^:]*)(?::(?<password>.*))?$/u
const QUERY_AFTER_HOST =
  /^[^:]+:\/\/(?:.*@)?(?:\[[^\]]*\]|[^:/?#@[\]]*)(?::\d*)?(?:\/[^?#]*)?\?[\w.-]+=(?!.*@[\w.-]+(?::\d+)?\/)/u

export class SafeURL implements URL {
  #url!: URL
  username!: string
  password!: string

  constructor(url: string | SafeURL) {
    if (url instanceof SafeURL) {
      this.#url = url.#url
      this.username = url.username
      this.password = url.password
      return
    }

    const queryAt = QUERY_AFTER_HOST.exec(url)?.[0].lastIndexOf('?')
    const atIndex = url.lastIndexOf('@', queryAt)
    const auth =
      (atIndex > 0 && url.slice(0, atIndex).match(authRegex)?.groups) || null

    this.#url = new URL(
      auth ? `${auth.protocol}://${url.slice(atIndex + 1)}` : url
    )
    this.username = auth?.user || ''
    this.password = auth?.password || ''
  }

  get protocol() {
    return this.#url.protocol
  }

  set protocol(value: string) {
    this.#url.protocol = value
  }

  get origin() {
    return `${this.protocol}//${this.host}`
  }

  get host() {
    return this.#url.host
  }

  set host(value: string) {
    this.#url.host = value
  }

  get hostname() {
    return this.#url.hostname
  }

  set hostname(value: string) {
    this.#url.hostname = value
  }

  get port() {
    return this.#url.port
  }

  set port(value: string) {
    this.#url.port = value
  }

  get pathname() {
    return this.#url.pathname
  }

  set pathname(value: string) {
    this.#url.pathname = value
  }

  get search() {
    return this.#url.search
  }

  set search(value: string) {
    this.#url.search = value
  }

  get hash() {
    return this.#url.hash
  }

  set hash(value: string) {
    this.#url.hash = value
  }

  get searchParams() {
    return this.#url.searchParams
  }

  get href() {
    const url = new URL(this.#url)
    const originalUsername = this.username
    const originalPassword = this.password

    const encodedUsername = encodeURIComponent(originalUsername)
    const encodedPassword = encodeURIComponent(originalPassword)

    url.username = encodedUsername || ''
    url.password = encodedPassword || ''

    let href = url.toString()

    if (originalUsername !== encodedUsername) {
      href = href.replace(encodedUsername, () =>
        originalUsername.replaceAll(' ', '%20')
      )
    }

    if (originalPassword !== encodedPassword) {
      href = href.replace(encodedPassword, () =>
        originalPassword.replaceAll(' ', '%20')
      )
    }

    return href
  }

  toString() {
    return this.href
  }

  toJSON() {
    return this.href
  }
}
