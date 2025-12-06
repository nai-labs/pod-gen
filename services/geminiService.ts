import { GoogleGenAI, Modality } from '@google/genai';
import { PodcastConfig } from '../types';

const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the podcast script using the requested model.
 * It instructs the model to format it correctly for the TTS speakers.
 */
export const generatePodcastScript = async (config: PodcastConfig): Promise<string> => {
  const ai = getClient();


  const speakerDefinitions = config.speakers.map(s => `${s.name}`).join(', ');

  const prompt = `
    You are an expert podcast scriptwriter and dialogue specialist. Write a podcast script about the following topic: "${config.topic}".
    
    The podcast features ${config.speakers.length} speaker(s): ${speakerDefinitions}.
    
    ## STYLE GUIDELINES (CRITICAL):
    1.  **EXTREME REALISM**: Real conversations are messy. They are NOT series of monologues.
    2.  **"PING PONG" DIALOGUE**: Keep turns SHORT. 1-2 sentences max often. Rapid fire back-and-forth.
    3.  **NON-VERBAL INTERJECTIONS**: 
        - Don't just finish sentences. React with SOUNDS.
        - Use [scoffs], [gasps], [giggles], [groans], [coughs], [whines], [clears throat].
        - Sometimes a turn should be JUST a sound. e.g. "Speaker B: [scoffs incredulously]"
    4.  **INTERRUPTIONS & OVERLAPS**: 
        - Speakers should frequently cut each other off with noises or quick words.
        - Use a dash "--" at the end of a line to show an interruption.
    5.  **AGGRESSIVE BACK-CHANNELING**: 
        - "Mhmm.", "Right.", but also non-verbal: [laughs], [sighs], [tsks].
    6.  **FILLERS & HESITATIONS**: Use "um", "like", "you know", "I mean", "sort of" liberally.
    7.  **EMOTION**: Use stage directions in square brackets e.g. [laughing], [sighs], [whispering].
    
    ## EXAMPLE INTERACTION:
    ${config.speakers[0].name}: So I saw this thing--
    ${config.speakers[1].name}: The article? 
    ${config.speakers[0].name}: Yeah, the article! And it said--
    ${config.speakers[1].name}: [laughs] I know what you're gonna say.
    ${config.speakers[0].name}: You do?
    ${config.speakers[1].name}: It's the part about the... um...
    ${config.speakers[0].name}: The quantum entanglement?
    ${config.speakers[1].name}: Yes! That part blew my mind.
    ${config.speakers[0].name}: Right? It's just... [sighs] chaos.
    ${config.speakers[1].name}: Total chaos.
    
    ## OUTPUT REQUIREMENTS:
    - Briefly use the format "SpeakerName: Text".
    - Ensure the speaker names match exactly: ${config.speakers.map(s => `"${s.name}"`).join(' and ')}.
    - CRITICAL: OPTIMIZED FOR ${config.length?.toUpperCase() || 'SHORT'} FORM settings.
    - Max ${config.length === 'long' ? 30 : config.length === 'medium' ? 16 : 8} conversational turns total.
    - Make every turn count. High energy, passionate, animated.
    - No introductions, no sign-offs. Jump straight into the heat of the topic.
  `;

  // We use a text generation model here because the TTS model cannot generate the script.
  const response = await ai.models.generateContent({
    model: config.scriptModel,
    contents: prompt,
  });

  return response.text || '';
};

/**
 * Generates the audio using the Native Audio TTS model.
 */
export const generatePodcastAudio = async (
  script: string,
  config: PodcastConfig
): Promise<string> => {
  const ai = getClient();

  // Construct the prompt for the TTS model
  // For multi-speaker, we need to ensure the script text aligns with the config.

  const isMultiSpeaker = config.speakers.length > 1;

  let speechConfig = {};

  if (isMultiSpeaker) {
    speechConfig = {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: config.speakers.map(s => ({
          speaker: s.name,
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: s.voiceName }
          }
        }))
      }
    };
  } else {
    // Single speaker
    speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: config.speakers[0].voiceName }
      }
    };
  }

  const response = await ai.models.generateContent({
    model: config.ttsModel,
    contents: [{ parts: [{ text: script }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: speechConfig,
      temperature: config.temperature,
    },
  });

  // Extract base64 audio
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Audio) {
    throw new Error("No audio data returned from Gemini.");
  }

  return base64Audio;
};