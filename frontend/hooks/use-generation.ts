'use client';

import { useState, useCallback, useRef } from 'react';
import { streamGeneration, type SSEEvent } from '@/lib/api';

type GenerationStatus = 'idle' | 'streaming' | 'complete' | 'error';

interface GenerationMessage {
  type: 'status' | 'text' | 'tool' | 'error';
  content: string;
  timestamp: Date;
}

interface GenerationResult {
  sandboxId: string;
  sandboxUrl: string;
  filesCreated: string[];
}

interface UseGenerationReturn {
  status: GenerationStatus;
  messages: GenerationMessage[];
  result: GenerationResult | null;
  error: string | null;
  generate: (
    prompt: string,
    options?: { projectId?: string; taskId?: string; autoCommit?: boolean }
  ) => Promise<void>;
  reset: () => void;
}

export function useGeneration(): UseGenerationReturn {
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [messages, setMessages] = useState<GenerationMessage[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<boolean>(false);

  const addMessage = useCallback((type: GenerationMessage['type'], content: string) => {
    setMessages((prev) => [...prev, { type, content, timestamp: new Date() }]);
  }, []);

  const generate = useCallback(
    async (
      prompt: string,
      options?: { projectId?: string; taskId?: string; autoCommit?: boolean }
    ) => {
      setStatus('streaming');
      setMessages([]);
      setResult(null);
      setError(null);
      abortRef.current = false;

      try {
        for await (const event of streamGeneration(prompt, options)) {
          if (abortRef.current) break;

          switch (event.type) {
            case 'status':
              addMessage('status', event.data.message);
              break;
            case 'text':
              addMessage('text', event.data.content);
              break;
            case 'tool':
              addMessage('tool', `${event.data.name}: ${event.data.action}`);
              break;
            case 'error':
              // Add error message but don't stop - Claude SDK may recover
              addMessage('error', event.data.message);
              // Only set error state, but continue listening for completion
              setError(event.data.message);
              // Don't return here - the SDK may retry and continue
              break;
            case 'complete':
              // Clear any errors if we successfully complete (SDK recovered)
              setError(null);
              setResult({
                sandboxId: event.data.sandboxId,
                sandboxUrl: event.data.sandboxUrl,
                filesCreated: event.data.filesCreated,
              });
              setStatus('complete');
              return;
          }
        }

        // If we get here without complete event, something went wrong
        if (status !== 'complete' && status !== 'error') {
          setStatus('error');
          setError('Stream ended unexpectedly');
        }
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Generation failed');
      }
    },
    [addMessage, status]
  );

  const reset = useCallback(() => {
    abortRef.current = true;
    setStatus('idle');
    setMessages([]);
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    messages,
    result,
    error,
    generate,
    reset,
  };
}
