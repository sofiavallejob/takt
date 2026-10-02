// A line's colour by where it sits in the pitch range.

/** A line's colour by where it sits in the pitch range: low (warm) to high (cool). */
export function lineCol(u) {
  const stops = [
    [0, 6, 62, 44],       // deep warm red
    [0.25, 26, 80, 50],   // amber
    [0.5, 46, 72, 45],    // gold
    [0.75, 165, 65, 42],  // teal
    [1, 220, 60, 52],     // cool blue
  ];
  let i = 0; while (i < stops.length - 2 && stops[i + 1][0] < u) i++;
  const a = stops[i], b = stops[i + 1], f = (u - a[0]) / (b[0] - a[0]);
  const h = a[1] + (b[1] - a[1]) * f, s = a[2] + (b[2] - a[2]) * f, l = a[3] + (b[3] - a[3]) * f;
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}
