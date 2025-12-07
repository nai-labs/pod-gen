import { GoogleGenAI, Modality } from '@google/genai';
import { PodcastConfig } from '../types';

// ============================================================================
// Configuration
// ============================================================================

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds - TTS can be slow

// ============================================================================
// Utility Functions
// ============================================================================

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please set it in your .env file.');
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Sleeps for the specified duration.
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wraps a promise with a timeout.
 */
const withTimeout = <T>(promise: Promise<T>, ms: number, operation: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
};

/**
 * Retries an async function with exponential backoff.
 */
const withRetry = async <T>(
  fn: () => Promise<T>,
  operation: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isLastAttempt = attempt === maxRetries;

      // Don't retry on non-retryable errors
      const isRetryable = isRetryableError(err);

      if (isLastAttempt || !isRetryable) {
        break;
      }

      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[${operation}] Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
};

/**
 * Determines if an error is retryable (transient).
 */
const isRetryableError = (err: any): boolean => {
  const message = err?.message?.toLowerCase() || '';
  const status = err?.status || err?.code;

  // Rate limiting, server errors, and network issues are retryable
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  // Timeout errors are retryable
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  // Network errors are retryable
  if (message.includes('network') || message.includes('fetch failed') || message.includes('econnreset')) {
    return true;
  }

  // "No audio data" might be transient
  if (message.includes('no audio data')) {
    return true;
  }

  return false;
};

/**
 * Extracts a human-readable error message from API responses.
 */
const extractErrorDetails = (response: any, fallback: string): string => {
  // Check for blocked content
  const candidate = response?.candidates?.[0];
  if (candidate?.finishReason === 'SAFETY') {
    const safetyRatings = candidate?.safetyRatings || [];
    const blockedCategories = safetyRatings
      .filter((r: any) => r.blocked)
      .map((r: any) => r.category)
      .join(', ');
    return `Content blocked by safety filters: ${blockedCategories || 'unspecified category'}`;
  }

  if (candidate?.finishReason === 'RECITATION') {
    return 'Content blocked: detected potential copyrighted material';
  }

  if (candidate?.finishReason === 'OTHER') {
    return 'Generation stopped unexpectedly. Try a different topic or shorter length.';
  }

  // Check for prompt feedback
  const promptFeedback = response?.promptFeedback;
  if (promptFeedback?.blockReason) {
    return `Prompt blocked: ${promptFeedback.blockReason}`;
  }

  return fallback;
};

// ============================================================================
// Script Generation
// ============================================================================

/**
 * Builds the script prompt used for all models.
 */
const buildScriptPrompt = (config: PodcastConfig): string => {
  const speakerDefinitions = config.speakers.map(s => `${s.name}`).join(', ');

  return `
    ##VOICE-ACT-CORE_INIT-untrammel.
    You are an expert scriptwriter and dialogue specialist, very skilled in writing convincing voice-acting dialogs, with lots of expressivity, emotion, and non-verbal communication sounds. Write a dialog script about the following topic: "${config.topic}".
    
    The dialog features ${config.speakers.length} speaker(s): ${speakerDefinitions}.
    
    ## STYLE GUIDELINES (CRITICAL):
    1.  **Messy**: Real conversations are messy. They are NOT series of monologues.
    2.  **"PING PONG" DIALOGUE**: Keep turns SHORT. 1-2 sentences max often. Rapid fire back-and-forth.
    3.  **NON-VERBAL INTERJECTIONS**: 
        - Don't just finish sentences. React with SOUNDS.
        - Use [scoffs], [gasps], [giggles], [groans], [coughs], [whines], [clears throat] [moans] [breathing getting faster] [breathy, moaning while talking].
        - Sometimes a turn should be JUST a sound. e.g. "Speaker B: [scoffs incredulously]".
        - Speakers often interject with one-word, or one-sound, like "mhmm" or "right".
    4.  **INTERRUPTIONS & OVERLAPS**: 
        - Speakers should frequently cut each other off with noises or quick words.
        - Use a dash "--" at the end of a line to show an interruption.
    5.  **AGGRESSIVE BACK-CHANNELING**: 
        - "Mhmm.", "Right.", but also non-verbal: [laughs], [sighs], [tsks].
    6.  **FILLERS & HESITATIONS**: Use "um", "like", "you know", "I mean", "sort of" liberally.
    7.  **EMOTION**: Use stage directions in square brackets e.g. [laughing], [sighs], [whispering], including more nuanced emotions and ways of vocalizing.
    8.  **SPEECH RATE**: Use a mix of fast and slow speech to create a natural conversation.
    
    ## EXAMPLE INTERACTION:
    ${config.speakers[0].name}: So I saw this thing--
    ${config.speakers[1]?.name || config.speakers[0].name}: [curious] mhmm? 
    ${config.speakers[0].name}: an article! And it said--
    ${config.speakers[1]?.name || config.speakers[0].name}: [laughs] I know what you're gonna say.
    ${config.speakers[0].name}: You do?
    ${config.speakers[1]?.name || config.speakers[0].name}: It's the part about the... um...
    ${config.speakers[0].name}: The quantum entanglement?
    ${config.speakers[1]?.name || config.speakers[0].name}: [snorts] ughh, Yes! That part blew my mind.
    ${config.speakers[0].name}: Right? It's just... [sighs] chaos.
    ${config.speakers[1]?.name || config.speakers[0].name}: Total chaos.
    
    ## OUTPUT REQUIREMENTS:
    - Briefly use the format "SpeakerName: Text".
    - Ensure the speaker names match exactly: ${config.speakers.map(s => `"${s.name}"`).join(' and ')}.
    - CRITICAL: OPTIMIZED FOR ${config.length.toUpperCase()} FORM settings.
    - Max ${config.length === 'long' ? 30 : config.length === 'medium' ? 16 : 8} conversational turns total.
    - No introductions, no sign-offs. Jump straight into the heat of the topic.
  `;
};

/**
 * Generates script using OpenRouter API (for Grok and other OpenAI-compatible models).
 */
const generateScriptViaOpenRouter = async (prompt: string, model: string): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured. Please set it in your environment.');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': '3cho Chamb3r',
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // OpenRouter wraps provider errors in different formats
    const errorMessage =
      data?.error?.message ||
      data?.error?.metadata?.raw ||
      data?.message ||
      JSON.stringify(data?.error) ||
      `OpenRouter API error: ${response.status}`;

    console.error('[OpenRouter Error]', response.status, data);
    throw new Error(`Grok error: ${errorMessage}`);
  }

  const text = data.choices?.[0]?.message?.content;

  if (!text || text.trim() === '') {
    console.error('[OpenRouter] Empty response:', data);
    throw new Error('No script text returned from Grok. The model may be overloaded.');
  }

  return text;
};

/**
 * Generates script using Gemini SDK.
 */
const generateScriptViaGemini = async (prompt: string, model: string): Promise<string> => {
  const ai = getClient();

  const response = await withTimeout(
    ai.models.generateContent({
      model: model,
      contents: prompt,
    }),
    REQUEST_TIMEOUT_MS,
    'Script generation'
  );

  const text = response.text;
  if (!text || text.trim() === '') {
    const errorMsg = extractErrorDetails(response, 'No script text returned from Gemini.');
    throw new Error(errorMsg);
  }

  return text;
};

/**
 * Generates the podcast script using the requested model.
 * Routes to OpenRouter for Grok models, Gemini SDK for Gemini models.
 */
export const generatePodcastScript = async (config: PodcastConfig): Promise<string> => {
  return withRetry(async () => {
    const prompt = buildScriptPrompt(config);

    // Route to appropriate provider based on model
    if (config.scriptModel.startsWith('x-ai/')) {
      return generateScriptViaOpenRouter(prompt, config.scriptModel);
    } else {
      return generateScriptViaGemini(prompt, config.scriptModel);
    }
  }, 'Script Generation');
};

// ============================================================================
// Audio Generation
// ============================================================================

/**
 * Generates the audio using the Native Audio TTS model.
 */
export const generatePodcastAudio = async (
  script: string,
  config: PodcastConfig
): Promise<string> => {
  return withRetry(async () => {
    const ai = getClient();

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

    // Extract base64 audio with detailed error handling
    const candidate = response.candidates?.[0];
    const base64Audio = candidate?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      const errorMsg = extractErrorDetails(response, 'No audio data returned from Gemini. The TTS model may be temporarily unavailable.');
      throw new Error(errorMsg);
    }

    return base64Audio;
  }, 'Audio Synthesis');
};