import { Box, Image } from '@mantine/core'
import type { CSSProperties } from 'react'

type BrandLogoProps = {
  /** Altura do logo em px */
  height?: number
  /** Largura máxima (mantém proporção) */
  maw?: number | string
  style?: CSSProperties
}

/** Logo oficial BARBERIA (public/logo.png). */
export function BrandLogo({ height = 36, maw, style }: BrandLogoProps) {
  return (
    <Box style={{ lineHeight: 0, ...style }}>
      <Image
        src="/logo.png"
        alt="BARBERIA"
        h={height}
        w="auto"
        fit="contain"
        maw={maw}
        style={{ display: 'block' }}
      />
    </Box>
  )
}
