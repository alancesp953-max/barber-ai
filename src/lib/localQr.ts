/** QR Code versão 1 (21×21), ECC L — gerado 100% no navegador, sem rede. */

const SIZE = 21
const DATA_CW = 19
const ECC_CW = 7
const FORMAT_L_MASK0 = 0x77c4

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function gfMul(a: number, b: number) {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

function rsEncode(data: number[]) {
  let gen = [1]
  for (let i = 0; i < ECC_CW; i++) {
    const next = new Array(gen.length + 1).fill(0)
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]
      next[j + 1] ^= gfMul(gen[j], EXP[i])
    }
    gen = next
  }
  const ecc = new Array(ECC_CW).fill(0)
  for (const byte of data) {
    const factor = byte ^ ecc[0]
    for (let j = 0; j < ECC_CW - 1; j++) {
      ecc[j] = ecc[j + 1] ^ gfMul(factor, gen[j + 1])
    }
    ecc[ECC_CW - 1] = gfMul(factor, gen[ECC_CW])
  }
  return ecc
}

function setFinder(m: boolean[][], r0: number, c0: number) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const border = r === 0 || r === 6 || c === 0 || c === 6
      const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4
      m[r0 + r][c0 + c] = border || inner
    }
  }
}

function reserved(r: number, c: number) {
  if (r <= 8 && c <= 8) return true
  if (r <= 8 && c >= SIZE - 8) return true
  if (r >= SIZE - 8 && c <= 8) return true
  if (r === 6 || c === 6) return true
  return false
}

function encodePayload(text: string) {
  const bytes = Array.from(new TextEncoder().encode(text)).slice(0, 17)
  const bits: number[] = []
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, 8)
  for (const b of bytes) push(b, 8)
  push(0, 4)
  while (bits.length % 8 !== 0) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]
    data.push(v)
  }
  const pads = [0xec, 0x11]
  let p = 0
  while (data.length < DATA_CW) data.push(pads[p++ % 2])
  return [...data, ...rsEncode(data)]
}

function buildMatrix(text: string) {
  const matrix = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false))
  setFinder(matrix, 0, 0)
  setFinder(matrix, 0, SIZE - 7)
  setFinder(matrix, SIZE - 7, 0)
  for (let i = 8; i < SIZE - 8; i++) {
    matrix[6][i] = i % 2 === 0
    matrix[i][6] = i % 2 === 0
  }
  matrix[SIZE - 8][8] = true

  const code = encodePayload(text)
  const stream: number[] = []
  for (const b of code) {
    for (let i = 7; i >= 0; i--) stream.push((b >> i) & 1)
  }

  let idx = 0
  let up = true
  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col = 5
    for (let n = 0; n < SIZE; n++) {
      const row = up ? SIZE - 1 - n : n
      for (const c of [col, col - 1]) {
        if (reserved(row, c)) continue
        const bit = stream[idx++] === 1
        const mask = (row + c) % 2 === 0
        matrix[row][c] = mask ? !bit : bit
      }
    }
    up = !up
  }

  const fmt = FORMAT_L_MASK0
  const bitAt = (i: number) => ((fmt >> i) & 1) === 1
  for (let i = 0; i <= 5; i++) matrix[8][i] = bitAt(i)
  matrix[8][7] = bitAt(6)
  matrix[8][8] = bitAt(7)
  matrix[7][8] = bitAt(8)
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = bitAt(i)
  for (let i = 0; i < 8; i++) matrix[SIZE - 1 - i][8] = bitAt(i)
  for (let i = 8; i < 15; i++) matrix[8][SIZE - 15 + i] = bitAt(i)
  matrix[SIZE - 8][8] = true
  return matrix
}

function drawFallback(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 260
  canvas.height = 260
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 260, 260)
  ctx.fillStyle = '#111111'
  ctx.fillRect(16, 16, 56, 56)
  ctx.fillRect(188, 16, 56, 56)
  ctx.fillRect(16, 188, 56, 56)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(24, 24, 40, 40)
  ctx.fillRect(196, 24, 40, 40)
  ctx.fillRect(24, 196, 40, 40)
  ctx.fillStyle = '#111111'
  ctx.fillRect(36, 36, 16, 16)
  ctx.fillRect(208, 36, 16, 16)
  ctx.fillRect(36, 208, 16, 16)
  ctx.font = '12px sans-serif'
  ctx.fillText('LAB LOCAL', 90, 130)
  ctx.fillText(text.slice(0, 18), 40, 150)
  return canvas.toDataURL('image/png')
}

export function makeLocalQrDataUrl(text: string) {
  try {
    const matrix = buildMatrix(text)
    const quiet = 4
    const module = 10
    const dim = (SIZE + quiet * 2) * module
    const canvas = document.createElement('canvas')
    canvas.width = dim
    canvas.height = dim
    const ctx = canvas.getContext('2d')
    if (!ctx) return drawFallback(text)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dim, dim)
    ctx.fillStyle = '#000000'
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!matrix[r][c]) continue
        ctx.fillRect((c + quiet) * module, (r + quiet) * module, module, module)
      }
    }
    return canvas.toDataURL('image/png')
  } catch {
    return drawFallback(text)
  }
}
