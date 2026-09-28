/** Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) → RGBA pixels. Used for blurhash input. */
export async function decodePng(bytes: Uint8Array): Promise<{ width: number; height: number; rgba: Uint8Array } | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 33 || view.getUint32(0) !== 0x89504e47) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const depth = data[8];
      colorType = data[9] ?? 0;
      if (depth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) return null;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height || idat.length === 0) return null;
  const inflated = new Uint8Array(await new Response(new Blob(idat as BlobPart[]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[y * (stride + 1) + 1 + x] ?? 0;
      const left = x >= channels ? (raw[y * stride + x - channels] ?? 0) : 0;
      const up = y > 0 ? (raw[(y - 1) * stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= channels ? (raw[(y - 1) * stride + x - channels] ?? 0) : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      raw[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  if (channels === 4) return { width, height, rgba: raw };
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = raw[index * 3] ?? 0;
    rgba[index * 4 + 1] = raw[index * 3 + 1] ?? 0;
    rgba[index * 4 + 2] = raw[index * 3 + 2] ?? 0;
    rgba[index * 4 + 3] = 255;
  }
  return { width, height, rgba };
}
