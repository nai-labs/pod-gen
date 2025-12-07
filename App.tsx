import React, { useState, useRef, useEffect } from 'react';
import { PodcastConfig, Speaker, GenerationStatus } from './types';
import { DEFAULT_SPEAKERS, TTS_MODELS } from './constants';
import { generatePodcastScript, generatePodcastAudio } from './services/geminiService';
import { decodeBase64, decodeAudioData, audioBufferToWav } from './utils/audioUtils';
import SpeakerCard from './components/SpeakerCard';
import Visualizer from './components/Visualizer';
import { Play, Pause, RefreshCw, Wand2, Download, Mic2, Cpu } from 'lucide-react';

const App: React.FC = () => {
    const [config, setConfig] = useState<PodcastConfig>({
        topic: '',
        speakerCount: 2,
        speakers: [...DEFAULT_SPEAKERS],
        ttsModel: 'gemini-2.5-pro-preview-tts',
        scriptModel: 'gemini-3-pro-preview',
        temperature: 1.0,
        length: 'short',
    });

    const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [generatedScript, setGeneratedScript] = useState<string>('');
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Audio State
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Audio Context Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const startTimeRef = useRef<number>(0);
    const pauseTimeRef = useRef<number>(0);

    useEffect(() => {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: 24000
        });
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;

        return () => {
            audioContextRef.current?.close();
        };
    }, []);

    const handleUpdateSpeaker = (id: string, updates: Partial<Speaker>) => {
        setConfig(prev => ({
            ...prev,
            speakers: prev.speakers.map(s => s.id === id ? { ...s, ...updates } : s)
        }));
    };

    const handleSpeakerCountChange = (count: 1 | 2) => {
        setConfig(prev => {
            let newSpeakers = [...prev.speakers];
            if (count === 1) {
                newSpeakers = [newSpeakers[0]];
            } else if (count === 2 && newSpeakers.length === 1) {
                newSpeakers.push({ id: '2', name: 'Beta', voiceName: 'Aoede' });
            }
            return { ...prev, speakerCount: count, speakers: newSpeakers };
        });
    };

    const handleGenerate = async () => {
        if (!config.topic.trim()) {
            setError("Missing input vector: topic required.");
            return;
        }
        setError(null);
        setStatus(GenerationStatus.WRITING_SCRIPT);
        setIsPlaying(false);
        if (sourceNodeRef.current) {
            sourceNodeRef.current.stop();
            sourceNodeRef.current = null;
        }

        try {
            const script = await generatePodcastScript(config);
            setGeneratedScript(script);

            setStatus(GenerationStatus.GENERATING_AUDIO);

            const base64Audio = await generatePodcastAudio(script, config);

            const rawBytes = decodeBase64(base64Audio);
            if (audioContextRef.current) {
                const buffer = await decodeAudioData(rawBytes, audioContextRef.current);
                setAudioBuffer(buffer);
            }

            setStatus(GenerationStatus.COMPLETED);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "System Failure.");
            setStatus(GenerationStatus.ERROR);
        }
    };

    // Update duration when buffer changes
    useEffect(() => {
        if (audioBuffer) {
            setDuration(audioBuffer.duration);
            setCurrentTime(0);
            pauseTimeRef.current = 0;
        }
    }, [audioBuffer]);

    // Animation frame loop for progress
    useEffect(() => {
        let animationFrameId: number;

        const renderLoop = () => {
            if (isPlaying && audioContextRef.current && startTimeRef.current) {
                const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
                const newTime = Math.min(elapsed, duration);
                setCurrentTime(newTime);
                animationFrameId = requestAnimationFrame(renderLoop);
            }
        };

        if (isPlaying) {
            renderLoop();
        }

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [isPlaying, duration]);

    const togglePlayback = () => {
        if (!audioContextRef.current || !audioBuffer || !analyserRef.current) return;

        if (isPlaying) {
            if (sourceNodeRef.current) {
                sourceNodeRef.current.stop();
                sourceNodeRef.current = null;
            }
            // Record where we paused
            if (audioContextRef.current) {
                pauseTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current;
            }
            setIsPlaying(false);
        } else {
            playFrom(pauseTimeRef.current);
        }
    };

    const playFrom = (offset: number) => {
        if (!audioContextRef.current || !audioBuffer || !analyserRef.current) return;

        // Stop existing if any (mostly for seeking)
        if (sourceNodeRef.current) {
            try { sourceNodeRef.current.stop(); } catch (e) { } // ignore
            sourceNodeRef.current = null;
        }

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);

        sourceNodeRef.current = source;

        // Set start time anchor
        startTimeRef.current = audioContextRef.current.currentTime - offset;

        source.start(0, offset);
        setIsPlaying(true);

        source.onended = () => {
            // Basic check to see if it ended naturally vs stopped
            // But accurate tracking is hard with WebAudio seeking. 
            // We'll rely on time comparison or manual stop state.
            // If we are still "playing" according to state but source stopped, check time.
            if (audioContextRef.current && Math.abs((audioContextRef.current.currentTime - startTimeRef.current) - audioBuffer.duration) < 0.2) {
                setIsPlaying(false);
                pauseTimeRef.current = 0;
                setCurrentTime(0);
            }
        };
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = parseFloat(e.target.value);
        setCurrentTime(newTime);
        pauseTimeRef.current = newTime;

        if (isPlaying) {
            playFrom(newTime);
        }
    };

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleDownload = () => {
        if (!audioBuffer) return;

        try {
            const wavBlob = audioBufferToWav(audioBuffer);
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `POD_GEN_${Date.now()}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Export failed", e);
            setError("Export protocol failed.");
        }
    };

    return (
        <div className="min-h-screen p-6 md:p-12 flex flex-col items-center gap-10 relative overflow-hidden bg-black text-zinc-200 selection:bg-indigo-500/30 selection:text-indigo-200 font-sans">

            {/* Ambient Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-900/20 blur-[120px] mix-blend-screen"></div>
                <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[60%] rounded-full bg-blue-900/20 blur-[120px] mix-blend-screen"></div>
                <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-cyan-900/10 blur-[100px] mix-blend-screen"></div>
            </div>

            {/* Header */}
            <header className="text-center space-y-4 z-10 relative mb-4">
                <div className="flex flex-col items-center justify-center gap-2">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)] animate-pulse"></div>
                        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">
                            3CHO CHAMB3R
                        </h1>
                        <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)] animate-pulse"></div>
                    </div>
                    <p className="text-zinc-500 text-xs font-medium tracking-[0.2em] uppercase">
                        Audio Synthesis Studio
                    </p>
                </div>
            </header>

            <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8 z-10">
                {/* Left Column: Configuration */}
                <div className="space-y-6">

                    {/* Topic Section */}
                    <div className="bg-zinc-900/40 backdrop-blur-xl p-8 rounded-3xl border border-white/5 shadow-2xl shadow-black/50 relative overflow-hidden group">

                        <h2 className="text-xs font-semibold text-zinc-400 mb-6 flex items-center gap-2 uppercase tracking-wider">
                            <Cpu className="w-3 h-3 text-cyan-500" />
                            Input Parameters
                        </h2>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-3 tracking-widest">Topic Vector</label>
                                <textarea
                                    value={config.topic}
                                    onChange={(e) => setConfig({ ...config, topic: e.target.value })}
                                    placeholder="Describe the desired podcast conversation..."
                                    className="w-full h-32 bg-black/50 border border-white/10 p-4 text-zinc-200 placeholder-zinc-700 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none resize-none transition-all text-sm rounded-2xl"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-3 tracking-widest">Processing Core</label>
                                    <div className="flex flex-col gap-2">
                                        {TTS_MODELS.map(model => (
                                            <button
                                                key={model.id}
                                                onClick={() => setConfig({ ...config, ttsModel: model.id as any })}
                                                className={`w-full py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider transition-all border flex justify-between items-center rounded-full ${config.ttsModel === model.id
                                                    ? 'bg-cyan-600 text-white border-transparent shadow-lg shadow-cyan-500/20'
                                                    : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                                                    }`}
                                            >
                                                <span>{model.label.split(' (')[0]}</span>
                                                {config.ttsModel === model.id && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_white]"></div>}
                                            </button>
                                        ))}
                                    </div>
                                </div>


                                <div>
                                    <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-3 tracking-widest">Script Model</label>
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => setConfig({ ...config, scriptModel: 'gemini-3-pro-preview' })}
                                            className={`w-full py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider transition-all border flex justify-between items-center rounded-full ${config.scriptModel === 'gemini-3-pro-preview'
                                                ? 'bg-cyan-600 text-white border-transparent shadow-lg shadow-cyan-500/20'
                                                : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                                                }`}
                                        >
                                            <span>PRO 3.0</span>
                                            {config.scriptModel === 'gemini-3-pro-preview' && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_white]"></div>}
                                        </button>
                                        <button
                                            onClick={() => setConfig({ ...config, scriptModel: 'gemini-2.5-flash' })}
                                            className={`w-full py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider transition-all border flex justify-between items-center rounded-full ${config.scriptModel === 'gemini-2.5-flash'
                                                ? 'bg-cyan-600 text-white border-transparent shadow-lg shadow-cyan-500/20'
                                                : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                                                }`}
                                        >
                                            <span>FLASH 2.5</span>
                                            {config.scriptModel === 'gemini-2.5-flash' && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_white]"></div>}
                                        </button>
                                        <button
                                            onClick={() => setConfig({ ...config, scriptModel: 'x-ai/grok-4.1-fast' })}
                                            className={`w-full py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider transition-all border flex justify-between items-center rounded-full ${config.scriptModel === 'x-ai/grok-4.1-fast'
                                                ? 'bg-rose-600 text-white border-transparent shadow-lg shadow-rose-500/20'
                                                : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                                                }`}
                                        >
                                            <span>GROK 4.1</span>
                                            {config.scriptModel === 'x-ai/grok-4.1-fast' && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_white]"></div>}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-3 tracking-widest">Host Config</label>
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => handleSpeakerCountChange(1)}
                                            className={`w-full py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider transition-all border text-left rounded-full ${config.speakerCount === 1
                                                ? 'bg-cyan-600 text-white border-transparent shadow-lg shadow-cyan-500/20'
                                                : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                                        >
                                            Single Unit
                                        </button>
                                        <button
                                            onClick={() => handleSpeakerCountChange(2)}
                                            className={`w-full py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider transition-all border text-left rounded-full ${config.speakerCount === 2
                                                ? 'bg-cyan-600 text-white border-transparent shadow-lg shadow-cyan-500/20'
                                                : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                                        >
                                            Dual Unit
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Temperature Slider */}
                            <div>
                                <div>
                                    <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-3 tracking-widest flex justify-between">
                                        <span>Variation (Temp)</span>
                                        <span className="text-cyan-400">{config.temperature.toFixed(1)}</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.2"
                                        value={config.temperature}
                                        onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_white] hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Length Selector */}
                            <div>
                                <label className="block text-[10px] text-gray-500 font-bold uppercase mb-2 tracking-widest">Duration</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['short', 'medium', 'long'].map((len) => (
                                        <button
                                            key={len}
                                            onClick={() => setConfig({ ...config, length: len as any })}
                                            className={`w-full py-2.5 px-2 text-[10px] font-bold uppercase tracking-wider transition-all border rounded-full ${config.length === len
                                                ? 'bg-cyan-600 text-white border-transparent shadow-lg shadow-cyan-500/20'
                                                : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                                        >
                                            {len}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Speakers Section */}
                    <div className="bg-zinc-900/40 backdrop-blur-xl p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
                        <h2 className="text-xs font-bold text-zinc-400 mb-6 flex items-center gap-2 uppercase tracking-wider">
                            <span className="text-cyan-500">///</span> Voice Allocation
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {config.speakers.map((speaker, idx) => (
                                <SpeakerCard
                                    key={speaker.id}
                                    index={idx}
                                    speaker={speaker}
                                    onUpdate={handleUpdateSpeaker}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={status === GenerationStatus.WRITING_SCRIPT || status === GenerationStatus.GENERATING_AUDIO}
                        className="w-full relative overflow-hidden group bg-white text-black font-bold py-6 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-[0.98]"
                    >
                        <div className="flex items-center justify-center gap-3 uppercase tracking-widest text-xs">
                            {status === GenerationStatus.WRITING_SCRIPT ? (
                                <>
                                    <RefreshCw className="animate-spin w-4 h-4" />
                                    Generating Script...
                                </>
                            ) : status === GenerationStatus.GENERATING_AUDIO ? (
                                <>
                                    <Mic2 className="animate-pulse w-4 h-4" />
                                    Synthesizing...
                                </>
                            ) : (
                                <>
                                    <Wand2 className="w-5 h-5 text-cyan-600" />
                                    Initialize Sequence
                                </>
                            )}
                        </div>
                    </button>

                    {error && (
                        <div className="p-4 bg-red-950/20 border border-red-900 text-red-400 text-xs font-mono text-center uppercase tracking-widest">
                            Error: {error}
                        </div>
                    )}

                </div>

                {/* Right Column: Output */}
                <div className="flex flex-col gap-6 h-full">

                    {/* Audio Player */}
                    <div className="bg-zinc-900/40 backdrop-blur-xl p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">

                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                Output Stream
                            </h2>
                            {status === GenerationStatus.COMPLETED && (
                                <span className="text-[10px] text-emerald-400 px-3 py-1 bg-emerald-950/30 rounded-full border border-emerald-900/50 uppercase tracking-wider">
                                    Ready
                                </span>
                            )}
                        </div>

                        <div className="mb-8 relative rounded-2xl overflow-hidden bg-black/40 border border-white/5">
                            <Visualizer isPlaying={isPlaying} analyser={analyserRef.current} />
                        </div>

                        {/* Scrubber */}
                        <div className="mb-8 flex items-center gap-4 px-2">
                            <span className="text-[10px] font-mono text-zinc-500 w-8 text-right">{formatTime(currentTime)}</span>
                            <input
                                type="range"
                                min="0"
                                max={duration || 100}
                                value={currentTime}
                                onChange={handleSeek}
                                disabled={!audioBuffer}
                                className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-150 transition-all shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                            />
                            <span className="text-[10px] font-mono text-zinc-500 w-8">{formatTime(duration)}</span>
                        </div>

                        <div className="flex items-center justify-center gap-8">
                            <button
                                onClick={togglePlayback}
                                disabled={!audioBuffer}
                                className="group relative w-20 h-20 flex items-center justify-center disabled:opacity-30 transition-all"
                            >
                                <div className="absolute inset-0 bg-white/5 rounded-full blur-md group-hover:bg-cyan-500/20 transition-all duration-500"></div>
                                <div className="absolute inset-0 border border-white/10 rounded-full group-hover:scale-105 group-hover:border-cyan-500/50 transition-all duration-300"></div>

                                {isPlaying ? (
                                    <Pause className="w-8 h-8 text-white fill-current" />
                                ) : (
                                    <Play className="w-8 h-8 text-white fill-current ml-1" />
                                )}
                            </button>

                            <button
                                onClick={handleDownload}
                                disabled={!audioBuffer}
                                className="text-zinc-600 hover:text-white transition-colors disabled:opacity-30 p-2 hover:bg-white/5 rounded-full"
                            >
                                <Download className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Script View */}
                    <div className="flex-1 bg-zinc-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-3xl flex flex-col relative overflow-hidden">
                        <h3 className="text-zinc-500 text-[10px] uppercase tracking-[0.3em] font-bold mb-6 flex items-center gap-2 border-b border-white/5 pb-4">
                            Transcript
                        </h3>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-6 font-mono text-xs text-zinc-300 leading-relaxed max-h-[500px] scrollbar-thin">
                            {generatedScript ? (
                                generatedScript.split('\n').map((line, i) => {
                                    const isSpeakerLabel = config.speakers.some(s => line.startsWith(s.name + ':'));
                                    return (
                                        <div key={i} className={`${line.trim() === '' ? 'h-2' : ''} ${isSpeakerLabel ? 'text-cyan-400 font-bold mt-4 mb-2 tracking-wider uppercase' : 'pl-4 border-l-2 border-white/5 ml-1'}`}>
                                            {line}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-800 gap-2 opacity-50">
                                    <p className="uppercase text-[10px] tracking-widest">No Data</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </main >
        </div >
    );
};

export default App;