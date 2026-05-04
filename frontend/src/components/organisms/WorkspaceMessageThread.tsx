import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { formatApiDateTime } from '@/lib/dateTime';
import {
  hasRenderablePreviewContent,
  sanitizeTemplateHtmlForPreview,
} from '@/lib/htmlPreview';
import type { WorkspaceMessageDTO } from '@/types';

type WorkspaceMessageThreadProps = {
  messages: WorkspaceMessageDTO[];
  monitoringLabel?: string;
  lastCheckedAt?: Date | null;
  refreshing?: boolean;
  newReceivedCount?: number;
  onRefresh?: () => void;
};

const previewStyle = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical' as const,
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

const buildPreview = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized || '（这条记录没有正文）';
};

const getMessageLabel = (direction: WorkspaceMessageDTO['direction']) =>
  direction === 'received' ? '老师回复' : '已发送';

const getMessageBubbleClassName = (direction: WorkspaceMessageDTO['direction']) =>
  direction === 'received'
    ? 'border-stone-200 bg-white text-stone-900 shadow-[0_18px_38px_-30px_rgba(41,37,36,0.26)]'
    : 'border-primary/15 bg-[linear-gradient(180deg,rgba(153,27,27,0.96),rgba(127,29,29,0.96))] text-white shadow-[0_22px_42px_-28px_rgba(127,29,29,0.38)]';

export const WorkspaceMessageThread = ({
  messages,
  monitoringLabel = '正在监听回复',
  lastCheckedAt = null,
  refreshing = false,
  newReceivedCount = 0,
  onRefresh,
}: WorkspaceMessageThreadProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [shouldStickToBottom, setShouldStickToBottom] = useState(true);
  const [expandedMessageId, setExpandedMessageId] = useState<number | null>(null);

  const realMessages = useMemo(
    () => messages.filter((message) => message.direction !== 'draft'),
    [messages],
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !shouldStickToBottom) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [realMessages.length, shouldStickToBottom]);

  const showJumpToReply = newReceivedCount > 0 && !shouldStickToBottom;

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const target = event.currentTarget;
        const distanceToBottom =
          target.scrollHeight - target.scrollTop - target.clientHeight;
        setShouldStickToBottom(distanceToBottom < 80);
      }}
      className="flex-1 min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(153,27,27,0.06),transparent_22%),linear-gradient(180deg,rgba(255,252,247,0.94),rgba(255,255,255,0.98))] px-4 py-4 sm:px-6"
    >
      <div
        className="mx-auto flex w-full max-w-6xl flex-col gap-4"
        data-message-thread-inner
      >
        <div className="sticky top-0 z-10 rounded-[24px] border border-stone-200/80 bg-white/92 px-4 py-3 shadow-sm backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-stone-900">通信记录</div>
                {newReceivedCount > 0 ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    新回复
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs leading-5 text-stone-500">
                <span>{monitoringLabel}</span>
                {lastCheckedAt ? (
                  <span>
                    上次检查{' '}
                    {lastCheckedAt.toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showJumpToReply ? (
                <button
                  type="button"
                  onClick={() => {
                    const node = scrollRef.current;
                    if (node) {
                      node.scrollTop = node.scrollHeight;
                    }
                    setShouldStickToBottom(true);
                  }}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  跳到新回复
                </button>
              ) : null}
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600">
                {realMessages.length} 条
              </span>
              {onRefresh ? (
                <button
                  type="button"
                  aria-label="刷新通信记录"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <RefreshCw className={clsx('h-4 w-4', refreshing && 'animate-spin')} />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {realMessages.length === 0 ? (
          <div className="rounded-[30px] border border-dashed border-stone-300 bg-white/94 px-6 py-14 text-center shadow-sm">
            <div className="text-lg font-semibold text-stone-900">暂无通信记录</div>
            <div className="mt-2 text-sm leading-7 text-stone-500">
              发出邮件或收到回复后，会显示在这里。
            </div>
          </div>
        ) : (
          realMessages.map((message) => {
            const isReceived = message.direction === 'received';
            const isExpanded =
              expandedMessageId === message.id &&
              realMessages.some((item) => item.id === expandedMessageId);
            const preview = buildPreview(message.content);
            const expandedHtml = message.content_html
              ? sanitizeTemplateHtmlForPreview(message.content_html)
              : '';
            const canRenderExpandedHtml =
              Boolean(expandedHtml) && hasRenderablePreviewContent(expandedHtml);

            return (
              <div
                key={message.id}
                className={clsx('flex w-full', isReceived ? 'justify-start' : 'justify-end')}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedMessageId((current) =>
                      current === message.id ? null : message.id,
                    )
                  }
                  className={clsx(
                    'w-full max-w-[86%] rounded-[28px] border px-5 py-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
                    getMessageBubbleClassName(message.direction),
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={clsx(
                        'rounded-full px-2.5 py-1 font-semibold',
                        isReceived
                          ? 'bg-stone-100 text-stone-700'
                          : 'bg-white/14 text-white',
                      )}
                    >
                      {getMessageLabel(message.direction)}
                    </span>
                    <span className={isReceived ? 'text-stone-400' : 'text-white/70'}>
                      {formatApiDateTime(message.created_at)}
                    </span>
                    <span
                      className={clsx(
                        'ml-auto inline-flex items-center gap-1 font-medium',
                        isReceived ? 'text-stone-500' : 'text-white/75',
                      )}
                    >
                      {isExpanded ? '收起' : '展开'}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </span>
                  </div>

                  {message.subject ? (
                    <div className="mt-3 text-sm font-semibold leading-6">
                      {message.subject}
                    </div>
                  ) : null}

                  {isExpanded && canRenderExpandedHtml ? (
                    <div
                      className={clsx(
                        'mt-3 overflow-x-auto rounded-2xl px-4 py-4 text-sm leading-7 shadow-inner',
                        isReceived
                          ? 'border border-stone-100 bg-white text-stone-900 shadow-stone-200/60'
                          : 'border border-white/20 bg-white/10 text-white/92 shadow-black/10 [&_*]:!text-inherit',
                      )}
                      data-message-html
                      dangerouslySetInnerHTML={{ __html: expandedHtml }}
                    />
                  ) : isExpanded ? (
                    <div
                      className={clsx(
                        'mt-3 whitespace-pre-wrap break-words text-sm leading-7',
                        isReceived ? 'text-stone-700' : 'text-white/92',
                      )}
                    >
                      {message.content}
                    </div>
                  ) : (
                    <div
                      className={clsx(
                        'mt-3 text-sm leading-7',
                        isReceived ? 'text-stone-600' : 'text-white/82',
                      )}
                      style={previewStyle}
                    >
                      {preview}
                    </div>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
