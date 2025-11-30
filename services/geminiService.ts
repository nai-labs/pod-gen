import { GoogleGenAI, Modality } from '@google/genai';
import { PodcastConfig } from '../types';

const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the podcast script using the requested model.
 * It instructs the model to format it correctly for the TTS speakers.
 */
export const generatePodcastScript = async (config: PodcastConfig): Promise<string> => {
  const ai = getClient();
  
  const speakerNames = config.speakers.map(s => s.name).join(' and ');
  const speakerDefinitions = config.speakers.map(s => `${s.name}`).join(', ');

  const prompt = `
    You are an expert podcast scriptwriter and dialogue specialist. Write a podcast script about the following topic: "${config.topic}".
    
    The podcast features ${config.speakers.length} speaker(s): ${speakerDefinitions}.
    
    ## STYLE GUIDELINES (CRITICAL):
    1.  **Natural & Messy**: Real people don't speak in perfect paragraphs. They speak in short bursts, they interrupt, they meander.
    2.  **Back-channeling**: The listener should FREQUENTLY interject with short affirmations like "Mhmm", "Yeah", "Right", "Oh wow", "Wait, really?".
    3.  **Fillers**: Use natural speech fillers (e.g., "um", "uh", "like", "I mean", "you know") to make it sound unscripted.
    4.  **Emotion & Direction**: Use stage directions in square brackets to guide the voice acting. 
        - Examples: [laughing], [sighs], [whispering], [excitedly], [sarcastically], [clears throat], [giggling mischievously].
        - Use these at the start of sentences or standalone to set the tone.
    5.  **Dynamic Flow**: Avoid long monologues. Create a back-and-forth rhythm. If one person has a longer point, the other MUST react during it (e.g., "Yeah...", "For sure").
    
    ## EXAMPLE INTERACTION:
    ${config.speakers[0].name}: [excited] So I was looking at this data yesterday...
    ${config.speakers[1].name}: Mhmm.
    ${config.speakers[0].name}: And you won't believe what I found.
    ${config.speakers[1].name}: [gasps] No way. Don't tell me it's...
    ${config.speakers[0].name}: [laughing] It absolutely is! It's just... [sighs] it's wild.
    ${config.speakers[1].name}: [giggling] Oh my god. You have to tell me.
    
    ## OUTPUT REQUIREMENTS:
    - Strictly use the format "SpeakerName: Text".
    - Ensure the speaker names match exactly: ${config.speakers.map(s => `"${s.name}"`).join(' and ')}.
    - Keep the total length dense but concise (approx 400-600 words).
    - The conversation should feel like a deep dive that goes slightly off the rails before coming back.
  `;

  // We use a text generation model here because the TTS model cannot generate the script.
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', 
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

  // We prepend a direction to the model to ensure it understands the assignment
  const ttsPrompt = isMultiSpeaker 
    ? `TTS the following conversation, paying close attention to the emotion tags and natural flow:\n\n${script}`
    : script;

  const response = await ai.models.generateContent({
    model: config.ttsModel,
    contents: [{ parts: [{ text: ttsPrompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: speechConfig,
    },
  });

  // Extract base64 audio
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!base64Audio) {
    throw new Error("No audio data returned from Gemini.");
  }

  return base64Audio;
};