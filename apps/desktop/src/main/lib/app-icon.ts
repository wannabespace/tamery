import { app, BrowserWindow, nativeImage } from 'electron'
import Store from 'electron-store'

import blue from '../../../resources/app-icons/blue.png'
import dark from '../../../resources/app-icons/dark.png'
import light from '../../../resources/app-icons/light.png'

const ICONS = { blue, dark, light }

type AppIcon = keyof typeof ICONS

// Sync with the icon grid in the PNGs: a 412px body inset 50px into 512px, the rest is padding and shadow.
const ICON_BODY = { height: 412, width: 412, x: 50, y: 50 }

const isAppIcon = (icon: unknown): icon is AppIcon =>
  typeof icon === 'string' && Object.hasOwn(ICONS, icon)

const store = new Store<{ icon: AppIcon }>({
  defaults: { icon: 'light' },
  name: 'app-icon',
})

// The store outlives releases: an icon a later version drops must fall back, not throw on every launch.
const storedIcon = () => {
  const icon = store.get('icon')
  return isAppIcon(icon) ? icon : 'light'
}

const image = (icon: AppIcon) => nativeImage.createFromDataURL(ICONS[icon])

// An empty image restores the bundled icon, the Icon Composer render that the light PNG only approximates.
const setDockIcon = (icon: AppIcon) =>
  app.dock?.setIcon(icon === 'light' ? nativeImage.createEmpty() : image(icon))

export const restoreDockIcon = () => setDockIcon(storedIcon())

export const windowIcon = () => {
  const icon = storedIcon()
  return icon === 'light' ? undefined : image(icon)
}

export const appIcon = {
  get: storedIcon,
  previews: () =>
    Object.fromEntries(
      Object.entries(ICONS).map(([icon, url]) => [
        icon,
        nativeImage.createFromDataURL(url).crop(ICON_BODY).toDataURL(),
      ])
    ) as Record<AppIcon, string>,
  set: (icon: AppIcon) => {
    if (!isAppIcon(icon)) {
      throw new Error('Unknown app icon')
    }
    store.set('icon', icon)
    setDockIcon(icon)
    if (process.platform !== 'darwin') {
      for (const win of BrowserWindow.getAllWindows()) {
        win.setIcon(image(icon))
      }
    }
  },
}
