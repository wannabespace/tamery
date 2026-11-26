import { useId } from 'react'

const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const DITHER_PIXEL = 2
const DITHER_SOLID_PERCENT = 40
const DITHER_LEVELS = [12, 8, 5, 3]

export const DitherFill = () => {
  const id = useId().replaceAll(/[^\w-]/gu, '')
  const tile = DITHER_PIXEL * 4
  const band = (100 - DITHER_SOLID_PERCENT) / DITHER_LEVELS.length
  return (
    <svg
      aria-hidden
      fill="currentColor"
      shapeRendering="crispEdges"
      className="absolute inset-0 size-full"
    >
      <defs>
        {DITHER_LEVELS.map((level) => (
          <pattern
            key={level}
            id={`${id}-${level}`}
            width={tile}
            height={tile}
            patternUnits="userSpaceOnUse"
          >
            {BAYER_4X4.map(
              (threshold, cell) =>
                threshold < level && (
                  <rect
                    key={cell}
                    x={(cell % 4) * DITHER_PIXEL}
                    y={Math.floor(cell / 4) * DITHER_PIXEL}
                    width={DITHER_PIXEL}
                    height={DITHER_PIXEL}
                  />
                )
            )}
          </pattern>
        ))}
      </defs>
      <rect width={`${DITHER_SOLID_PERCENT}%`} height="100%" />
      {DITHER_LEVELS.map((level, index) => (
        <rect
          key={level}
          x={`${DITHER_SOLID_PERCENT + index * band}%`}
          width={`${band}%`}
          height="100%"
          fill={`url(#${id}-${level})`}
        />
      ))}
    </svg>
  )
}
