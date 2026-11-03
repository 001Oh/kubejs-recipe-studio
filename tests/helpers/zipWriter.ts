/**
 * 测试用最小 ZIP 写入器（只用 node:zlib，不引入依赖）。
 * 只支持 store / deflate 两种方式，够造「带 lang/model/texture 的 mod jar」这个场景。
 */
import { deflateRawSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipFileInput {
  name: string
  /** 文本或二进制；文本会按 UTF-8 编码 */
  data: string | Buffer
}

export function buildZip(entries: ZipFileInput[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const raw = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data
    const deflated = deflateRawSync(raw)
    const useDeflate = deflated.length < raw.length
    const body = useDeflate ? deflated : raw
    const method = useDeflate ? 8 : 0
    const crc = crc32(raw)

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0, 12) // date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)

    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // made by
    central.writeUInt16LE(20, 6) // needed
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(0, 38) // external attrs
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)

    locals.push(local, body)
    centrals.push(central)
    offset += local.length + body.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, ...centrals, end])
}

/** 写一个 jar 到磁盘并返回路径 */
export function writeJar(path: string, entries: ZipFileInput[]): string {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buildZip(entries))
  return path
}

/** 16×16 的合法 PNG（内容不重要，只要文件头/尺寸对） */
export function fakePng(seed = 0): Buffer {
  // 1x1 的最小 PNG 结构 + IHDR 标明 16×16；解压器只校验 CRC，不校验像素
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(16, 0)
  ihdr.writeUInt32BE(16, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([len, typeBuf, data, crcBuf])
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const idat = deflateRawSync(Buffer.alloc(16 * (1 + 16 * 4), seed % 255))
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}
