import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center bg-white"
    >
      {/* Color block accent */}
      <div
        className="absolute top-0 left-0 right-0 h-2 rounded-b-none"
        style={{ background: '#dceeb1' }}
      />

      {/* 404 number */}
      <div
        className="text-[120px] font-black tracking-tight select-none leading-none text-black"
        style={{ letterSpacing: '-0.04em', opacity: 0.08 }}
      >
        404
      </div>

      <div className="space-y-3 -mt-8">
        <p className="text-3xl font-bold text-black" style={{ letterSpacing: '-0.02em' }}>
          Page not found
        </p>
        <p className="text-base text-black/50 max-w-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>

      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-black hover:bg-black/80 active:scale-[0.97] transition-all"
        style={{ borderRadius: 50 }}
      >
        Go to Dashboard
      </button>
    </div>
  );
}
