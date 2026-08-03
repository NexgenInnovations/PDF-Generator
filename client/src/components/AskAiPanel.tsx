import { useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import type { Template } from '@pdfme/common';
import { api, type AiChatMessage, type AiOccupiedRegion } from '../lib/api.js';

interface AskAiPanelProps {
  onClose: () => void;
  onTemplateReady: (template: Template) => void;
  occupiedRegions?: AiOccupiedRegion[];
}

export default function AskAiPanel({ onClose, onTemplateReady, occupiedRegions }: AskAiPanelProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    { role: 'assistant', content: "Describe the form you'd like to create — what's it for, and what fields does it need?" },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: AiChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError(null);
    try {
      const res = await api.aiFormChat(next, occupiedRegions);
      setMessages([...next, { role: 'assistant', content: res.message }]);
      if (res.done && res.template) {
        onTemplateReady(res.template);
      }
      setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '40vw', maxWidth: 520, minWidth: 380,
        height: '70vh',
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} />
            Ask AI to build your form
          </span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: '#f7f7f5' }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: m.role === 'user' ? '#000' : '#fff',
                color: m.role === 'user' ? '#fff' : '#000',
                border: m.role === 'user' ? 'none' : '1px solid #e6e6e6',
                borderRadius: 12,
                padding: '8px 12px',
                fontSize: 13,
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
            </div>
          ))}
          {error && (
            <div style={{ color: '#dc2626', fontSize: 12 }}>{error}</div>
          )}
          <div ref={listEndRef} />
        </div>

        <div style={{ padding: 12, borderTop: '1px solid #e6e6e6', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your form, or answer the question above…"
            disabled={sending}
            style={{
              flex: 1, resize: 'none', height: 40, maxHeight: 120,
              border: '1px solid #e6e6e6', borderRadius: 12,
              padding: '8px 10px', fontSize: 13, outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => void send()}
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-black hover:bg-black/80 disabled:opacity-50 transition-all active:scale-[0.97]"
            style={{ borderRadius: 50 }}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
