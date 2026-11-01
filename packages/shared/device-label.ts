import { UAParser } from 'ua-parser-js'

const electronAppNameRegex =
  /\s+(?<appName>[A-Za-z][\w.-]*)\/(?<appVersion>[\d.]+)\s+Chrome\//u

const getElectronAppName = (ua: string) => {
  const m = ua.match(electronAppNameRegex)
  const appName = m?.groups?.appName
  const appVersion = m?.groups?.appVersion
  return appName && appVersion ? `${appName} ${appVersion}` : null
}

export const formatDeviceLabel = (ua: string) => {
  const parser = new UAParser(ua)
  const browser = parser.getBrowser()
  const os = parser.getOS()
  let osStr: string | null = null
  if (os.name && os.version) {
    osStr = `${os.name} ${os.version}`
  } else if (os.name) {
    osStr = os.name
  }
  if (browser.name === 'Electron') {
    const appName = getElectronAppName(ua)
    if (appName) {
      return osStr ? `${appName} on ${osStr}` : appName
    }
    return osStr ? `Electron on ${osStr}` : 'Electron'
  }
  const browserStr = browser.version
    ? `${browser.name} ${browser.version}`
    : browser.name
  if (!browserStr) {
    return osStr || 'Unknown device'
  }
  return osStr ? `${browserStr} on ${osStr}` : browserStr
}

/** Without versions, for a list a person reads at a glance; desktop browsers also freeze the OS version they report. */
export const formatBrowserName = (ua: string) => {
  const parser = new UAParser(ua)
  const browser = parser.getBrowser().name ?? 'A browser'
  const os = parser.getOS().name
  return os ? `${browser} on ${os}` : browser
}
