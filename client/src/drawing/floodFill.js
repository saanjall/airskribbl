// Lines have soft, antialiased edges. The tolerance lets a fill run into that edge,
// and growing the result a little covers it, so no pale halo is left along the line.
const TOLERANCE = 72;
const GROW = 1;

/** Marks the region around (x, y) in an ImageData-like {data, width, height}. */
function findRegion({ data, width, height }, x, y) {
  const start = (y * width + x) * 4;
  const [tr, tg, tb] = [data[start], data[start + 1], data[start + 2]];
  const mask = new Uint8Array(width * height);
  const open = (p) => {
    const i = p * 4;
    return !mask[p]
      && Math.abs(data[i] - tr) <= TOLERANCE
      && Math.abs(data[i + 1] - tg) <= TOLERANCE
      && Math.abs(data[i + 2] - tb) <= TOLERANCE;
  };

  // Scanline fill: take a whole row span, then queue one seed per span above and below.
  const stack = [y * width + x];
  while (stack.length) {
    const seed = stack.pop();
    if (!open(seed)) continue;
    const rowStart = seed - (seed % width);
    const rowEnd = rowStart + width - 1;
    let left = seed;
    let right = seed;
    while (left > rowStart && open(left - 1)) left -= 1;
    while (right < rowEnd && open(right + 1)) right += 1;
    mask.fill(1, left, right + 1);

    for (const offset of [-width, width]) {
      if (left + offset < 0 || right + offset >= mask.length) continue;
      let inSpan = false;
      for (let p = left + offset; p <= right + offset; p++) {
        const free = open(p);
        if (free && !inSpan) stack.push(p);
        inSpan = free;
      }
    }
  }

  return mask;
}

/** True when the region around (x, y) has a boundary all the way round. */
export function isEnclosed(image, x, y) {
  const { width, height } = image;
  const mask = findRegion(image, x, y);
  for (let px = 0; px < width; px++) {
    if (mask[px] || mask[(height - 1) * width + px]) return false;
  }
  for (let py = 0; py < height; py++) {
    if (mask[py * width] || mask[py * width + width - 1]) return false;
  }
  return true;
}

/** Fills the region around (x, y). Returns false when it already has that colour. */
export function floodFill(image, x, y, [r, g, b]) {
  const { data, width, height } = image;
  const start = (y * width + x) * 4;
  if (data[start] === r && data[start + 1] === g && data[start + 2] === b) return false;
  const mask = findRegion(image, x, y);

  const paint = (px, py) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = (py * width + px) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const p = py * width + px;
      if (!mask[p]) continue;
      paint(px, py);
      const edge = (px > 0 && !mask[p - 1]) || (px < width - 1 && !mask[p + 1])
        || (py > 0 && !mask[p - width]) || (py < height - 1 && !mask[p + width]);
      if (!edge) continue;
      for (let dy = -GROW; dy <= GROW; dy++) {
        for (let dx = -GROW; dx <= GROW; dx++) paint(px + dx, py + dy);
      }
    }
  }
  return true;
}
