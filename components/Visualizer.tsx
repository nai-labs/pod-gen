import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isPlaying: boolean;
  analyser: AnalyserNode | null;
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isPlaying) {
        // Clear canvas if paused/stopped
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Draw a flat line or silence state
        ctx.beginPath();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        return;
      }

      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2; // Scale down

        // Cyberpunk Gradient
        // Base is Cyan, Tip is Fuchsia
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        gradient.addColorStop(0, '#06b6d4'); // Cyan 500
        gradient.addColorStop(1, '#d946ef'); // Fuchsia 500

        ctx.fillStyle = gradient;
        
        // Add a glow effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(6, 182, 212, 0.5)";

        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        // Reset shadow for performance
        ctx.shadowBlur = 0;

        x += barWidth + 1;
      }
    };

    if (isPlaying) {
      draw();
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw idle line
      ctx.beginPath();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, analyser]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={100} 
      className="w-full h-24 rounded-lg bg-black border border-gray-900 shadow-inner"
    />
  );
};

export default Visualizer;