/** Art-direction palette (PLAN §9). Warm everywhere except the teal accent. */
export const C = {
  oak: 0x2b1b12,
  oakDark: 0x1a100a,
  oakLight: 0x3d2819,
  // aged, heavy brass (darker and less saturated than the plan's #B8913A — see DECISIONS.md)
  brass: 0xa07e35,
  brassShadow: 0x553e17,
  brassLight: 0xc9a75a,
  brassDeep: 0x34250c,
  iron: 0x2e2f33,
  ironLight: 0x5a5d63,
  ironDark: 0x141518,
  stone: 0x3a3a40,
  stoneDark: 0x232328,
  stoneLight: 0x55555c,
  parchment: 0xe8d9b0,
  enamel: 0x1c130d,
  teal: 0x7fe3d4,
  pupil: 0x060b0b,
  wall: 0x0c0b0d,
  gold: 0xffc65a,
  black: 0x000000,
  white: 0xffffff,
} as const;

export const CSS = {
  teal: '#7fe3d4',
  parchment: '#e8d9b0',
} as const;
