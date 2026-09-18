export function tokensInBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`no block for ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const block = css.slice(open + 1, close);

  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );
}

function oklchToSrgb255(
  lightness: number,
  chroma: number,
  hueDegrees: number,
): [number, number, number] {
  const hueRadians = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);

  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return linear.map((value) => {
    const clamped = Math.min(1, Math.max(0, value));
    const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255);
  }) as [number, number, number];
}

export function toRgb255(colour: string): [number, number, number] {
  const hex = colour.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const value = parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  const oklch = colour.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (oklch) {
    return oklchToSrgb255(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
  }

  throw new Error(`not a recognised colour (expected hex or oklch): ${colour}`);
}

export function toRgba(colour: string): { rgb: [number, number, number]; alpha: number } {
  const translucent = colour.match(
    /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\/\s*([\d.]+)\s*\)$/,
  );
  if (translucent) {
    return {
      rgb: [Number(translucent[1]), Number(translucent[2]), Number(translucent[3])],
      alpha: Number(translucent[4]),
    };
  }

  return { rgb: toRgb255(colour), alpha: 1 };
}

export function composite(over: string, under: string): [number, number, number] {
  const top = toRgba(over);
  const bottom = toRgb255(under);

  return top.rgb.map((channelValue, index) =>
    Math.round(top.alpha * channelValue + (1 - top.alpha) * bottom[index]),
  ) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function contrastWhenPaintedOn(over: string, under: string): number {
  return contrast(toHex(composite(over, under)), under);
}

export function tokenValue(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`--${name} is not declared`);
  return value;
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(toRgb255(foreground)),
    relativeLuminance(toRgb255(background)),
  ].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}
