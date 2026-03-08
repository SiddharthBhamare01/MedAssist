import { useEffect, useRef } from 'react';

const STATUS_LABELS = {
  idle: '',
  connecting: 'Connecting to AI agent...',
  running: 'AI agent is working...',
  done: 'Analysis complete',
  error: 'Connection lost',
};

const STEP_ICON = {
  tool_call: '🔧',
  tool_result: '✅',
  thinking: '🧠',
  message: '💬',
};

function StepRow({ step, index }) {
  const icon = STEP_ICON[step.type] || '⚡';
  return (
    <div className="flex items-start gap-2.5 animate-fade-in">
      <span className="mt-0.5 text-base shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-700 leading-snug">{step.label}</p>
        {step.detail && (
          <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{step.detail}</p>
        )}
      </div>
      <span className="ml-auto text-[10px] text-gray-300 shrink-0">#{index + 1}</span>
    </div>
  );
}

export default function AgentStatusPanel({ steps = [], status = 'idle', className = '' }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps.length]);

  if (status === 'idle') return null;

  const isRunning = status === 'running' || status === 'connecting';

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {isRunning ? (
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
        ) : status === 'done' ? (
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
        ) : (
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />
        )}
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Agent Status
        </span>
        <span className="ml-auto text-xs text-gray-400">{STATUS_LABELS[status]}</span>
      </div>

      {/* Steps */}
      {steps.length > 0 ? (
        <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
          {steps.map((step, i) => (
            <StepRow key={i} step={step} index={i} />
          ))}
          <div ref={bottomRef} />
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">Waiting for agent steps...</p>
      )}

      {/* Turn count */}
      {steps.length > 0 && (
        <p className="mt-3 text-[10px] text-gray-300 text-right">
          {steps.length} step{steps.length !== 1 ? 's' : ''} recorded
        </p>
      )}
    </div>
  );
}
