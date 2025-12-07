export interface Voice {
  name: string;
  label: string;
  gender: 'Male' | 'Female';
  description: string;
}

export interface Speaker {
  id: string;
  name: string; // The name used in the script (e.g., "Host", "Guest")
  voiceName: string; // The Gemini voice name (e.g., "Kore")
}

export interface PodcastConfig {
  topic: string;
  speakerCount: 1 | 2;
  speakers: Speaker[];
  ttsModel: 'gemini-2.5-flash-preview-tts' | 'gemini-2.5-pro-preview-tts';
  scriptModel: 'gemini-3-pro-preview' | 'gemini-2.5-flash' | 'x-ai/grok-4.1-fast';
  temperature: number;
  length: 'short' | 'medium' | 'long';
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  WRITING_SCRIPT = 'WRITING_SCRIPT',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface AudioState {
  buffer: AudioBuffer | null;
  duration: number;
}