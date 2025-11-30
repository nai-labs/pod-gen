
# PodGen Studio (Cyberpunk Edition)

A neural audio synthesis interface that generates meandering, natural-sounding podcasts using Google's Gemini Native Audio models.

## Features

- **Cyberpunk UI**: A fully themed interface with neon aesthetics, visualizers, and orbitron typography.
- **Dual Core Processing**: Switch between **Gemini 2.5 Pro** (High Quality) and **Gemini 2.5 Flash** (Speed) for audio generation.
- **Natural Scripts**: Uses Gemini 3 Pro to write messy, human-like dialogue with interruptions, back-channeling ("mhmm", "yeah"), and emotion tags.
- **Multi-Speaker**: Supports single or dual-speaker setups with distinct female voice personalities (Leda, Aoede, etc.).
- **Audio Visualization**: Real-time frequency analysis of the generated audio.
- **WAV Export**: Download your generated podcasts as standard WAV files.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Ensure you have a valid Google Gemini API Key. If running locally, you may need to set this in your environment or a `.env` file (though the code currently looks for `process.env.API_KEY`).

3. **Run the App**
   ```bash
   npm start
   ```

## Technology Stack

- **Frontend**: React 19, Tailwind CSS
- **AI**: @google/genai SDK
- **Audio**: Web Audio API (Context, Analyser, BufferSource)

## Usage

1. Enter a **Topic Vector** (what you want the podcast to be about).
2. Select your **Processing Core** (Pro or Flash).
3. Configure your **Host Units** (Voices).
4. Click **Initialize Sequence** to generate the script and audio.
5. Play or Download the result.

## License

MIT
