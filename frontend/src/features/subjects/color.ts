export const COLOR_PATTERN = /^(chart-(1[0-2]|[1-9])|#[0-9a-fA-F]{6})$/;

export function resolveSubjectColor(color: string): string {
  if (color.startsWith("chart-")) {
    return `var(--${color})`;
  }
  return color;
}

export function isValidColor(color: string): boolean {
  return COLOR_PATTERN.test(color);
}

export function autoPickColor(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) {
    h = (h * 31 + ch.charCodeAt(0)) | 0;
  }
  const slot = (Math.abs(h) % 12) + 1;
  return `chart-${slot}`;
}
