const DOMAIN = [0.1, 1.25, 2, 2.5, 3.3, 4.2, 4.9, 5.8, 6.7, 7.7, 9]
const RANGE = [
  '#4290FB',
  '#4FC0FF',
  '#4FFFD5',
  '#7CFF4F',
  '#F6F05C',
  '#FF8068',
  '#FF4E6F',
  '#C645B8',
  '#6563DE',
  '#18158E',
  '#000000'
]

function lerp(a: string, b: string, t: number): string {
  const h = (s: string): [number, number, number] => [
    parseInt(s.slice(1, 3), 16),
    parseInt(s.slice(3, 5), 16),
    parseInt(s.slice(5, 7), 16)
  ]
  const [r1, g1, b1] = h(a)
  const [r2, g2, b2] = h(b)
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`
}

export function srColor(rating: number): string {
  if (rating < 0.1) return '#AAAAAA'
  if (rating >= 9) return '#000000'
  for (let i = 0; i < DOMAIN.length - 1; i++) {
    if (rating <= DOMAIN[i + 1]) {
      return lerp(RANGE[i], RANGE[i + 1], (rating - DOMAIN[i]) / (DOMAIN[i + 1] - DOMAIN[i]))
    }
  }
  return '#000000'
}
