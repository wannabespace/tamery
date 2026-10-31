import { app, BrowserWindow, nativeImage } from 'electron'
import Store from 'electron-store'

import blue from '../../../resources/app-icons/blue.png'
import dark from '../../../resources/app-icons/dark.png'
import light from '../../../resources/app-icons/light.png'

const ICONS = { blue, dark, light }

type AppIcon = keyof typeof ICONS

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
  get: () => ({ icon: store.get('icon'), previews: ICONS }),
  set: (icon: AppIcon) => {
    store.set('icon', icon)
    setIcon(icon)
  },
}
