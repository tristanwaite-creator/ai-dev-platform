'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ExternalLink, RefreshCw, X, Loader2 } from 'lucide-react';

interface PreviewPanelProps {
  sandboxUrl: string | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  onClose?: () => void;
}

export function PreviewPanel({
  sandboxUrl,
  isLoading,
  onRefresh,
  onClose,
}: PreviewPanelProps) {
  if (!sandboxUrl && !isLoading) return null;

  return (
    <Card className="flex flex-col overflow-hidden h-full min-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
          </div>
          <span className="ml-2 text-xs text-muted-foreground">
            {isLoading ? 'Loading preview...' : 'Live Preview'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {sandboxUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => window.open(sandboxUrl, '_blank')}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 bg-white">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : sandboxUrl ? (
          <iframe
            src={sandboxUrl}
            className="h-full w-full"
            title="Preview"
          />
        ) : null}
      </div>
    </Card>
  );
}
