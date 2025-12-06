import React from 'react';
import { Speaker } from '../types';
import { AVAILABLE_VOICES } from '../constants';

interface SpeakerCardProps {
  speaker: Speaker;
  index: number;
  onUpdate: (id: string, updates: Partial<Speaker>) => void;
  isRemovable: boolean;
  onRemove: (id: string) => void;
}

const SpeakerCard: React.FC<SpeakerCardProps> = ({ speaker, index, onUpdate, isRemovable, onRemove }) => {
  return (
    <div className="bg-[#080808] p-4 rounded-sm border border-cyan-900/40 hover:border-cyan-500/50 transition-all duration-300 space-y-3 relative overflow-hidden group">
      {/* Cyberpunk corner markers */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-600"></div>
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-600"></div>
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-600"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-600"></div>

      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xs font-black text-cyan-700 uppercase tracking-widest group-hover:text-cyan-400 transition-colors">
          // TERMINAL_0{index + 1}
        </h3>
        {isRemovable && (
          <button
            onClick={() => onRemove(speaker.id)}
            className="text-gray-700 hover:text-red-500 transition-colors text-[10px] uppercase font-bold tracking-widest"
          >
            [PURGE]
          </button>
        )}
      </div>

      <div>
        <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1 tracking-widest">Identifier</label>
        <input
          type="text"
          value={speaker.name}
          onChange={(e) => onUpdate(speaker.id, { name: e.target.value })}
          className="w-full bg-[#030303] border border-gray-800 rounded-none px-3 py-2 text-cyan-300 text-sm focus:border-cyan-500 focus:shadow-[0_0_10px_rgba(6,182,212,0.2)] outline-none font-mono placeholder-gray-800 transition-all"
          placeholder="e.g. Host"
        />
      </div>

      <div>
        <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1 tracking-widest">Voice Synth</label>
        <div className="grid grid-cols-1 gap-1.5">
          {AVAILABLE_VOICES.map((voice) => (
            <button
              key={voice.name}
              onClick={() => onUpdate(speaker.id, { voiceName: voice.name })}
              className={`flex items-center justify-between p-2 border transition-all duration-200 relative overflow-hidden ${speaker.voiceName === voice.name
                  ? 'bg-cyan-950/30 border-cyan-500 text-cyan-200 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]'
                  : 'bg-[#0a0a0a] border-gray-900 text-gray-600 hover:border-cyan-800 hover:text-gray-400'
                }`}
            >
              <div className="flex flex-col text-left z-10">
                <span className="font-bold text-xs font-mono tracking-widest">{voice.label}</span>
                <span className="text-[8px] opacity-70 uppercase tracking-wider">{voice.description}</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 border uppercase font-bold z-10 ${speaker.voiceName === voice.name ? 'border-cyan-500/50 text-cyan-400' : 'border-gray-800 text-gray-700'
                }`}>
                {voice.gender.charAt(0)}
              </span>

              {/* Active Glitch Overlay */}
              {speaker.voiceName === voice.name && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/5 to-transparent skew-x-12 pointer-events-none"></div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SpeakerCard;