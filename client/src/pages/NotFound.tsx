import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center"
      style={{ background: '#000' }}
    >
      {/* Glow bg */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(0,87,255,0.10) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* 404 number */}
      <div
        className="text-8xl font-black tracking-tight select-none"
        style={{
          background: 'linear-gradient(135deg, #0057FF 0%, #00CFFF 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 0 24px rgba(0,207,255,0.35))',
          position: 'relative',
        }}
      >
        404
      </div>

      <div className="space-y-2 relative">
        <p className="text-xl font-bold text-white">Page not found</p>
        <p className="text-sm text-[#A0B4CC] max-w-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>

      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 hover:shadow-[0_0_28px_rgba(0,207,255,0.55)] active:scale-[0.97] relative"
        style={{
          background: 'linear-gradient(135deg, #0057FF, #00CFFF)',
          boxShadow: '0 0 18px rgba(0,207,255,0.40)',
        }}
      >
        Go to Dashboard
      </button>
    </div>
  );
}
