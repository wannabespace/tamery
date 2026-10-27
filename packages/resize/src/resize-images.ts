import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'
import type { Sharp } from 'sharp'

import { toIco } from './ico'
import type { IcoOutput, PngOutput, ResizeConfig, Transform } from './types'

const SQUIRCLE_EXPONENT = 5
const SQUIRCLE_POINTS = 720
const ROUND_RADIUS = 0.22

interface Source {
  file: string
  height: number
  width: number
}

const getOutline = (corners: 'round' | 'squircle', size: number) => {
  if (corners === 'round') {
    return `<rect width="${size}" height="${size}" rx="${ROUND_RADIUS * size}"/>`
  }
  const half = size / 2
  const points = Array.from({ length: SQUIRCLE_POINTS }, (_, index) => {
    const angle = (2 * Math.PI * index) / SQUIRCLE_POINTS
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const x = Math.sign(cos) * Math.abs(cos) ** (2 / SQUIRCLE_EXPONENT)
    const y = Math.sign(sin) * Math.abs(sin) ** (2 / SQUIRCLE_EXPONENT)
    return `${(half + half * x).toFixed(2)},${(half + half * y).toFixed(2)}`
  })
  return `<path d="M${points.join('L')}Z"/>`
}

const resize = (
  { file, height, width }: Source,
  size: number,
  { corners, zoom = 1 }: Transform
): Sharp => {
  const crop = Math.round(Math.min(width, height) / zoom)
  const image = sharp(file)
    .extract({
      height: crop,
      left: Math.round((width - crop) / 2),
      top: Math.round((height - crop) / 2),
      width: crop,
    })
    .resize(size, size)
  if (!corners) {
    return image
  }
  return image.composite([
    {
      blend: 'dest-in',
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${getOutline(corners, size)}</svg>`
      ),
    },
  ])
}

const toPng = (image: Sharp) =>
  image.png({ compressionLevel: 9, palette: true }).toBuffer()

const encode = async (
  source: Source,
  output: IcoOutput | PngOutput,
  zoom: number
) => {
  const transform = { zoom, ...output }
  if ('size' in output) {
    return toPng(resize(source, output.size, transform))
  }
  return toIco(
    await Promise.all(
      output.sizes.map(async (size) => ({
        png: await toPng(resize(source, size, transform)),
        size,
      }))
    )
  )
}

type Output = IcoOutput | PngOutput

export const resizeImages = async (
  { images, zoom = 1 }: ResizeConfig,
  root: string
) => {
  const outputsByImage = await Promise.all(
    Object.entries(images).map(async ([image, folders]) => {
      const file = path.join(root, image)
      const { height, width } = await sharp(file).metadata()
      return Object.entries(folders).flatMap(([folder, files]) =>
        Object.entries(files).map(([name, output]: [string, Output]) => ({
          output,
          source: { file, height, width },
          target: path.join(folder, name),
        }))
      )
    })
  )
  const outputs = outputsByImage.flat()

  const listed = new Set<string>()
  for (const { target } of outputs) {
    if (listed.has(target)) {
      throw new Error(`${target} is listed more than once`)
    }
    listed.add(target)
  }

  return Promise.all(
    outputs.map(async ({ output, source, target }) => {
      const content = await encode(source, output, zoom)
      await mkdir(path.dirname(path.join(root, target)), { recursive: true })
      await writeFile(path.join(root, target), content)
      return target
    })
  )
}
