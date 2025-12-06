# POD_GEN_V2 Usage Guide

**Version**: 1.0.0
**Tech Stack**: React, Vite, Google Gemini AI

## Overview
**POD_GEN_V2** is a neural audio synthesis interface that generates realistic, multi-speaker podcast episodes using Google's Gemini models. It creates a script based on your topic and then synthesizes the audio with high-fidelity "messy" dialogue including interruptions and back-channeling.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18 or higher recommended.
- **npm** or **yarn**.
- **Google Cloud API Key**: You need access to Gemini Pro and Gemini Nano/Flash models.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd pod-gen
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure API Key**:
    The application requires an API key in your environment to function.
    You may need to start the application with the key injected:
    ```bash
    export API_KEY="your_google_api_key_here"
    ```
    *Note: Check `vite.config.ts` or `geminiService.ts` if you need to set up a `.env` file (e.g., `VITE_API_KEY` or similar depending on the exact build configuration).*

4.  **Start the Development Server**:
    ```bash
    npm start
    ```
    This will launch the application at `http://localhost:5173`.

---

## 🎛 Interface Guide

The interface is divided into two main sections: **Configuration** (Left) and **Output** (Right).

### 1. Configuration (Left Board)

#### Input Parameters
- **Topic Vector**: Enter the subject of your podcast here. Be descriptive!
  - *Example*: "The future of space travel and why Mars is overrated."
- **Processing Core**: Select your preferred AI model.
  - **PRO CORE (Quality)**: Slower generation but higher nuance and better instruction following.
  - **FLASH CORE (Speed)**: Faster generation, good for quick prototypes.
- **Host Config**:
  - **Single Unit**: One speaker (monologue/narration).
  - **Dual Unit**: Two speakers (dialogue/debate).

#### Voice Allocation
- Modify the "Host" and "Guest" settings if needed (visual representation of the speakers).

### 2. Output (Right Board)

#### Generation Status
- Click **INITIALIZE SEQUENCER** to start.
- **Stage 1: Scripting**: The AI writes a "messy" script with emotion tags and interruptions.
- **Stage 2: Synthesizing**: The text is converted to audio using Gemini's native audio capabilities.

#### Playback Control
- **Visualizer**: Watch the real-time frequency analysis during playback.
- **Controls**: Play, Pause, and Resume.
- **Download**: Click the download icon to save the generating `.wav` file to your machine.

#### Transcript View
- Scroll through the generated script to read along.
- Note the `[emotion]` tags and `--` interruption markers that guide the audio generation.

---

## 🛠 Troubleshooting

| Issue | Possible Cause | Solution |
| :--- | :--- | :--- |
| **"System Failure" Error** | Invalid API Key or Quota Exceeded | Check your Google Cloud Console quota and ensure your API key is exported correctly. |
| **Silent Audio** | Browser Autoplay Policy | Click "Play" manualy. Ensure your system volume is up. |
| **Script Generation Stuck** | API Timeout | The Pro model can be slow. Wait a few moments or switch to Flash. |

---

*Verified for Cyberpunk OS v2.0*
