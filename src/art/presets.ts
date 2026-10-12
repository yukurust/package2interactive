export interface GamePreset {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  spineText: string;
  spineColor: string;
  spineTextColor: string;
  accentColor: string;
  frontImage: string;
  backImage: string;
  cartridgeCode: string;
  synopsis: string;
  fontTitle: string;
  fontSub: string;
  features: string[];
}

export const PRESETS: GamePreset[] = [
  {
    id: 'lumiward',
    name: 'LUMIWARD',
    title: 'LUMIWARD',
    subtitle: 'Far Lights, Higher Places',
    spineText: 'LUMIWARD   Far Lights, Higher Places',
    spineColor: '#e50012',
    spineTextColor: '#ffffff',
    accentColor: '#f5c542',
    frontImage: './art/lumiward-front.jpg',
    backImage: './art/lumiward-back.jpg',
    cartridgeCode: 'LA-H-ALUMA-JPN',
    synopsis:
      'Awaken above the boundless sea of clouds. Uncover the lost citadel of the ancients across floating sky archipelagos.',
    fontTitle: 'Cinzel',
    fontSub: 'Cormorant Garamond',
    features: ['1 Player', 'Action / Adventure', 'Full Controller Support'],
  },
  {
    id: 'mosslight',
    name: 'MOSSLIGHT',
    title: 'MOSSLIGHT',
    subtitle: 'The Spirit Path',
    spineText: 'MOSSLIGHT   The Spirit Path',
    spineColor: '#1d6e46',
    spineTextColor: '#ffffff',
    accentColor: '#a7f3d0',
    frontImage: './art/mosslight-front.jpg',
    backImage: './art/mosslight-front.jpg',
    cartridgeCode: 'LA-H-BMOSA-JPN',
    synopsis:
      'Journey through an enchanted forest forgotten by time. Guide a lost child and an ancient lantern spirit to safety.',
    fontTitle: 'Cinzel',
    fontSub: 'Inter',
    features: ['1-2 Players', 'Co-op Adventure', 'Atmospheric'],
  },
  {
    id: 'starline',
    name: 'STARLINE 2088',
    title: 'STARLINE',
    subtitle: 'Apex Velocity: 2088',
    spineText: 'STARLINE   Apex Velocity: 2088',
    spineColor: '#ff5722',
    spineTextColor: '#ffffff',
    accentColor: '#ffe082',
    frontImage: './art/starline-front.jpg',
    backImage: './art/starline-front.jpg',
    cartridgeCode: 'LA-H-CSTRA-JPN',
    synopsis:
      'Break supersonic barriers across neon salt flats and canyon circuits. Precision zero-G anti-gravity racing.',
    fontTitle: 'Orbitron',
    fontSub: 'Inter',
    features: ['1-8 Players', 'Anti-Gravity Racing', 'Online Multiplayer'],
  },
];
