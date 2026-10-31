import { app, BrowserWindow, nativeImage } from 'electron'
import Store from 'electron-store'

import blue from '../../../resources/app-icons/blue.png'
import dark from '../../../resources/app-icons/dark.png'
import light from '../../../resources/app-icons/light.png'

const ICONS = { blue, dark, light }

type AppIcon = keyof typeof ICONS

// Sync with the icon grid in the PNGs: a 412px body inset 50px into 512px, the rest is padding and shadow.
const ICON_BODY = { height: 412, width: 412, x: 50, y: 50 }

const previews = () =>
  Object.fromEntries(
    Object.entries(ICONS).map(([icon, url]) => [
      icon,
      nativeImage.createFromDataURL(url).crop(ICON_BODY).toDataURL(),
    ])
  ) as Record<AppIcon, string>

const store = new Store<{ icon: AppIcon }>({
  defaults: { icon: 'light' },
  name: 'app-icon',
})

const setIcon = (icon: AppIcon) => {
  const image = nativeImage.createFromDataURL(ICONS[icon])
  if (process.platform === 'darwin') {
    app.dock?.setIcon(image)
    return
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.setIcon(image)
  }
}

// Leave the bundled icon alone for light: on macOS it is the Icon Composer render, which the PNG only approximates.
export const restoreAppIcon = () => {
  const icon = store.get('icon')
  if (icon !== 'light') {
    setIcon(icon)
  }
}

export const appIcon = {
  get: () => ({ icon: store.get('icon'), previews: previews() }),
  set: (icon: AppIcon) => {
    store.set('icon', icon)
    setIcon(icon)
  },
}
