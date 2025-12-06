import React, { useState, useRef, useEffect } from 'react';
import { PodcastConfig, Speaker, GenerationStatus } from './types';
import { DEFAULT_SPEAKERS, TTS_MODELS } from './constants';
import { generatePodcastScript, generatePodcastAudio } from './services/geminiService';
import { decodeBase64, decodeAudioData, audioBufferToWav } from './utils/audioUtils';
import SpeakerCard from './components/SpeakerCard';
import Visualizer from './components/Visualizer';
import { Play, Pause, RefreshCw, Wand2, Download, Radio, Mic2, Cpu, Zap } from 'lucide-react';

const App: React.FC = () => {
    const [config, setConfig] = useState<PodcastConfig>({
        topic: '',
        speakerCount: 2,
        speakers: [...DEFAULT_SPEAKERS],
        ttsModel: 'gemini-2.5-pro-preview-tts',
        scriptModel: 'gemini-3-pro-preview',
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
        <div className="min-h-screen p-6 md:p-12 flex flex-col items-center gap-8 relative overflow-hidden bg-black selection:bg-cyan-500/40 selection:text-cyan-100">

            {/* Cyberpunk Grid Background */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#080808_1px,transparent_1px),linear-gradient(to_bottom,#080808_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none z-0"></div>

            {/* Accent Glows */}
            <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-cyan-900/10 blur-[150px] pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[20%] w-[40%] h-[40%] rounded-full bg-blue-900/10 blur-[150px] pointer-events-none"></div>

            {/* Header */}
            <header className="text-center space-y-2 z-10 relative">
                <div className="flex items-center justify-center gap-3 mb-2">
                    <Radio className="w-6 h-6 text-cyan-500 animate-pulse" />
                    <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-cyan-400 uppercase tracking-[0.2em] drop-shadow-[0_0_15px_rgba(6,182,212,0.3)] font-orbitron">
                        POD_GEN_V2
                    </h1>
                </div>
                <p className="text-cyan-500/50 max-w-lg mx-auto font-mono text-[10px] tracking-[0.3em] uppercase border-b border-cyan-900/30 pb-4">
                    Neural Audio Synthesis Interface
                </p>
            </header>

            <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8 z-10">
                {/* Left Column: Configuration */}
                <div className="space-y-6">

                    {/* Topic Section */}
                    <div className="bg-[#050505] p-6 rounded-sm border border-gray-900 relative group overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-800 to-transparent opacity-50"></div>

                        <h2 className="text-sm font-bold text-cyan-600 mb-6 flex items-center gap-2 uppercase tracking-widest font-orbitron">
                            <Cpu className="w-4 h-4" />
                            Input Parameters
                        </h2>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] text-gray-500 font-bold uppercase mb-2 tracking-widest">Topic Vector</label>
                                <textarea
                                    value={config.topic}
                                    onChange={(e) => setConfig({ ...config, topic: e.target.value })}
                                    placeholder="Describe the desired podcast conversation..."
                                    className="w-full h-32 bg-[#020202] border border-gray-800 p-4 text-cyan-100 placeholder-gray-800 focus:border-cyan-600 focus:shadow-[0_0_20px_rgba(6,182,212,0.1)] outline-none resize-none transition-all font-mono text-sm rounded-sm"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] text-gray-500 font-bold uppercase mb-2 tracking-widest">Processing Core</label>
                                    <div className="flex flex-col gap-2">
                                        {TTS_MODELS.map(model => (
                                            <button
                                                key={model.id}
                                                onClick={() => setConfig({ ...config, ttsModel: model.id as any })}
                                                className={`w-full py-2 px-3 text-[10px] font-bold uppercase tracking-widest transition-all border flex justify-between items-center ${config.ttsModel === model.id
                                                    ? 'bg-cyan-950/20 text-cyan-400 border-cyan-600 shadow-[inset_0_0_10px_rgba(6,182,212,0.1)]'
                                                    : 'bg-black border-gray-800 text-gray-600 hover:text-gray-400'
                                                    }`}
                                            >
                                                <span>{model.label.split(' (')[0]}</span>
                                                {config.ttsModel === model.id && <Zap className="w-3 h-3 text-cyan-400" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>


                                <div>
                                    <label className="block text-[10px] text-gray-500 font-bold uppercase mb-2 tracking-widest">Script Model</label>
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => setConfig({ ...config, scriptModel: 'gemini-3-pro-preview' })}
                                            className={`w-full py-2 px-3 text-[10px] font-bold uppercase tracking-widest transition-all border flex justify-between items-center ${config.scriptModel === 'gemini-3-pro-preview'
                                                ? 'bg-cyan-950/20 text-cyan-400 border-cyan-600 shadow-[inset_0_0_10px_rgba(6,182,212,0.1)]'
                                                : 'bg-black border-gray-800 text-gray-600 hover:text-gray-400'
                                                }`}
                                        >
                                            <span>PRO 3.0</span>
                                            {config.scriptModel === 'gemini-3-pro-preview' && <Zap className="w-3 h-3 text-cyan-400" />}
                                        </button>
                                        <button
                                            onClick={() => setConfig({ ...config, scriptModel: 'gemini-2.5-flash' })}
                                            className={`w-full py-2 px-3 text-[10px] font-bold uppercase tracking-widest transition-all border flex justify-between items-center ${config.scriptModel === 'gemini-2.5-flash'
                                                ? 'bg-cyan-950/20 text-cyan-400 border-cyan-600 shadow-[inset_0_0_10px_rgba(6,182,212,0.1)]'
                                                : 'bg-black border-gray-800 text-gray-600 hover:text-gray-400'
                                                }`}
                                        >
                                            <span>FLASH 2.5</span>
                                            {config.scriptModel === 'gemini-2.5-flash' && <Zap className="w-3 h-3 text-cyan-400" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] text-gray-500 font-bold uppercase mb-2 tracking-widest">Host Config</label>
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => handleSpeakerCountChange(1)}
                                            className={`w-full py-2 px-3 text-[10px] font-bold uppercase tracking-widest transition-all border text-left ${config.speakerCount === 1 ? 'bg-cyan-950/20 text-cyan-400 border-cyan-600' : 'bg-black border-gray-800 text-gray-600 hover:text-gray-400'}`}
                                        >
                                            Single Unit
                                        </button>
                                        <button
                                            onClick={() => handleSpeakerCountChange(2)}
                                            className={`w-full py-2 px-3 text-[10px] font-bold uppercase tracking-widest transition-all border text-left ${config.speakerCount === 2 ? 'bg-cyan-950/20 text-cyan-400 border-cyan-600' : 'bg-black border-gray-800 text-gray-600 hover:text-gray-400'}`}
                                        >
                                            Dual Unit
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Temperature Slider */}
                            <div>
                                <label className="block text-[10px] text-gray-500 font-bold uppercase mb-2 tracking-widest flex justify-between">
                                    <span>Variation (Temp)</span>
                                    <span className="text-cyan-400">{config.temperature?.toFixed(1) || '1.0'}</span>
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.2"
                                    value={config.temperature || 1.0}
                                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                                />
                            </div>

                            {/* Length Selector */}
                            <div>
                                <label className="block text-[10px] text-gray-500 font-bold uppercase mb-2 tracking-widest">Duration</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['short', 'medium', 'long'].map((len) => (
                                        <button
                                            key={len}
                                            onClick={() => setConfig({ ...config, length: len as any })}
                                            className={`w-full py-2 px-1 text-[10px] font-bold uppercase tracking-widest transition-all border ${config.length === len || (!config.length && len === 'short') ? 'bg-cyan-950/20 text-cyan-400 border-cyan-600' : 'bg-black border-gray-800 text-gray-600 hover:text-gray-400'}`}
                                        >
                                            {len}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Speakers Section */}
                    <div className="bg-[#050505] p-6 rounded-sm border border-gray-900 relative">
                        <h2 className="text-sm font-bold text-gray-500 mb-6 flex items-center gap-2 uppercase tracking-widest font-orbitron">
                            <span className="text-cyan-800">///</span> Voice Allocation
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {config.speakers.map((speaker, idx) => (
                                <SpeakerCard
                                    key={speaker.id}
                                    index={idx}
                                    speaker={speaker}
                                    onUpdate={handleUpdateSpeaker}
                                    isRemovable={false}
                                    onRemove={() => { }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={status === GenerationStatus.WRITING_SCRIPT || status === GenerationStatus.GENERATING_AUDIO}
                        className="w-full relative overflow-hidden group bg-cyan-950/10 text-cyan-400 font-bold py-6 border border-cyan-800/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-cyan-900/20 hover:border-cyan-500"
                    >
                        {/* Scanline effect */}
                        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(6,182,212,0.05)_50%)] bg-[size:100%_4px] pointer-events-none"></div>

                        <div className="relative z-10 flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-sm">
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
                                    <Wand2 className="w-4 h-4" />
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
                    <div className="bg-[#050505] p-6 border border-gray-900 relative backdrop-blur-xl group">
                        {/* Decorative Elements */}
                        <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-cyan-900/30 rounded-tr-xl"></div>
                        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-cyan-900/30 rounded-bl-xl"></div>

                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xs font-bold text-cyan-600 uppercase tracking-widest flex items-center gap-2">
                                Output Stream
                            </h2>
                            {status === GenerationStatus.COMPLETED && (
                                <span className="text-[9px] text-cyan-400 px-2 py-1 border border-cyan-800 bg-cyan-950/30 uppercase tracking-widest">
                                    Ready
                                </span>
                            )}
                        </div>

                        <div className="mb-6 relative">
                            <Visualizer isPlaying={isPlaying} analyser={analyserRef.current} />
                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.8)_100%)]"></div>
                        </div>

                        {/* Scrubber */}
                        <div className="mb-6 flex items-center gap-3 px-2">
                            <span className="text-[10px] font-mono text-cyan-500/50 w-8 text-right">{formatTime(currentTime)}</span>
                            <input
                                type="range"
                                min="0"
                                max={duration || 100}
                                value={currentTime}
                                onChange={handleSeek}
                                disabled={!audioBuffer}
                                className="flex-1 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                            />
                            <span className="text-[10px] font-mono text-cyan-500/50 w-8">{formatTime(duration)}</span>
                        </div>

                        <div className="flex items-center justify-center gap-8">
                            <button
                                onClick={togglePlayback}
                                disabled={!audioBuffer}
                                className="group relative w-16 h-16 flex items-center justify-center disabled:opacity-30 transition-all"
                            >
                                <div className="absolute inset-0 border border-cyan-600 rounded-full group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all duration-300"></div>
                                <div className={`absolute inset-0 border border-cyan-400 rounded-full opacity-0 group-hover:opacity-100 animate-ping`}></div>

                                {isPlaying ? (
                                    <Pause className="w-6 h-6 text-cyan-400 fill-current" />
                                ) : (
                                    <Play className="w-6 h-6 text-cyan-400 fill-current ml-1" />
                                )}
                            </button>

                            <button
                                onClick={handleDownload}
                                disabled={!audioBuffer}
                                className="text-gray-600 hover:text-cyan-400 transition-colors disabled:opacity-30"
                            >
                                <Download className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Script View */}
                    <div className="flex-1 bg-[#050505] border border-gray-900 p-6 flex flex-col relative overflow-hidden">
                        <h3 className="text-gray-600 text-[10px] uppercase tracking-[0.3em] font-bold mb-4 flex items-center gap-2 border-b border-gray-900 pb-2">
                            Transcript
                        </h3>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-4 font-mono text-xs text-cyan-100/70 leading-relaxed max-h-[500px] scrollbar-thin">
                            {generatedScript ? (
                                generatedScript.split('\n').map((line, i) => {
                                    const isSpeakerLabel = config.speakers.some(s => line.startsWith(s.name + ':'));
                                    return (
                                        <div key={i} className={`${line.trim() === '' ? 'h-2' : ''} ${isSpeakerLabel ? 'text-cyan-400 font-bold mt-4 mb-1 tracking-wider' : 'pl-0 border-l border-gray-800 pl-3 ml-1'}`}>
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