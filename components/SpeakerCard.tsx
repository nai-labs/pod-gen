import React from 'react';
import { Speaker } from '../types';
import { AVAILABLE_VOICES } from '../constants';

interface SpeakerCardProps {
  speaker: Speaker;
  index: number;
  onUpdate: (id: string, updates: Partial<Speaker>) => void;
}

const SpeakerCard: React.FC<SpeakerCardProps> = ({ speaker, index, onUpdate }) => {
  return (
    <div className="bg-black/20 p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all duration-300 space-y-4 group">

      <div className="flex justify-between items-center">
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">
          // TERMINAL_0{index + 1}
        </h3>
      </div>

      <div>
        <label className="block text-[10px] text-zinc-600 font-bold uppercase mb-2 tracking-widest">Identifier</label>
        <input
          type="text"
          value={speaker.name}
          onChange={(e) => onUpdate(speaker.id, { name: e.target.value })}
          className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-2.5 text-zinc-200 text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none font-sans placeholder-zinc-700 transition-all"
          placeholder="e.g. Host"
        />
      </div>

      <div>
        <label className="block text-[10px] text-zinc-600 font-bold uppercase mb-2 tracking-widest">Voice Synth</label>
        <div className="grid grid-cols-1 gap-2">
          {AVAILABLE_VOICES.map((voice) => (
            <button
              key={voice.name}
              onClick={() => onUpdate(speaker.id, { voiceName: voice.name })}
              className={`flex items-center justify-between p-3 border transition-all duration-200 rounded-xl ${speaker.voiceName === voice.name
                ? 'bg-cyan-600 border-transparent text-white shadow-lg shadow-cyan-500/20'
                : 'bg-zinc-900/30 border-white/5 text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300'
                }`}
            >
              <div className="flex flex-col text-left">
                <span className="font-bold text-xs tracking-wider">{voice.label}</span>
                <span className={`text-[9px] uppercase tracking-wider ${speaker.voiceName === voice.name ? 'text-cyan-200' : 'text-zinc-600'}`}>{voice.description}</span>
              </div>
              <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-bold ${speaker.voiceName === voice.name ? 'bg-white/20 text-white' : 'bg-black/20 text-zinc-600'
                }`}>
                {voice.gender.charAt(0)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SpeakerCard;