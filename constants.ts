import { Voice } from './types';

// Updated voice list based on Gemini Native Audio availability (Female voices).
export const AVAILABLE_VOICES: Voice[] = [
  { name: 'Leda', label: 'Leda', gender: 'Female', description: 'Sophisticated, balanced, articulate.' },
  { name: 'Autonoe', label: 'Autonoe', gender: 'Female', description: 'Deep, resonant, authoritative.' },
  { name: 'Laomedeia', label: 'Laomedeia', gender: 'Female', description: 'Soft, empathetic, clear.' },
  { name: 'Aoede', label: 'Aoede', gender: 'Female', description: 'Expressive, dynamic, engaging.' },
  { name: 'Despina', label: 'Despina', gender: 'Female', description: 'Calm, steady, professional.' },
];

export const DEFAULT_SPEAKERS = [
  { id: '1', name: 'Alpha', voiceName: 'Leda' },
  { id: '2', name: 'Beta', voiceName: 'Aoede' },
];

export const TTS_MODELS = [
  { id: 'gemini-2.5-pro-preview-tts', label: 'PRO CORE (Quality)' },
  { id: 'gemini-2.5-flash-preview-tts', label: 'FLASH CORE (Speed)' },
] as const;