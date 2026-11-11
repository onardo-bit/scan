"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Bot,
  RotateCcw,
  TerminalSquare,
  Webhook,
  KeySquare,
  Loader2,
} from "lucide-react";
import { PageShell, SectionTitle, Chip } from "@/components/ui";
import { useProfile } from "@/components/profile";
import { cn } from "@/lib/util/format";

interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

interface ChatMsg {
  mid: number;
  mine: boolean;
  text: string;
  keyboard?: InlineButton[][];
}

interface BotOutput {
  mode: "send" | "edit";
  chatId: string;
  messageId?: number;
  msg: { text: string; keyboard?: InlineButton[][] };
}

/** Render the subset of Telegram markdown the bot uses. */
function MdLite({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*|`[^`]+`)/g).map((seg, i) => {
    if (seg.startsWith("*") && seg.endsWith("*"))
      return (
        <strong key={i} className="font-semibold text-white">
          {seg.slice(1, -1)}
        </strong>
      );
    if (seg.startsWith("`") && seg.endsWith("`"))
      return (
        <code key={i} className="rounded bg-black/30 px-1 font-mono text-[11px] text-emerald-200">
          {seg.slice(1, -1)}
        </code>
      );
    return <span key={i}>{seg}</span>;
  });
  return <p className="whitespace-pre-wrap break-words">{parts}</p>;
}

export default function BotPage() {
  const { profile } = useProfile();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [hookState, setHookState] = useState<{ tokenConfigured: boolean } | null>(null);
  const counter = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatId = profile ? `sim-${profile.id}` : "sim-anon";

  const applyOutputs = useCallback((outputs: BotOutput[]) => {
    setMsgs((prev) => {
      let next = [...prev];
      for (const o of outputs) {
        if (o.mode === "edit" && o.messageId) {
          next = next.map((m) =>
            m.mid === o.messageId ? { ...m, text: o.msg.text, keyboard: o.msg.keyboard } : m,
          );
        } else {
          next.push({ mid: counter.current++, mine: false, text: o.msg.text, keyboard: o.msg.keyboard });
        }
      }
      return next;
    });
  }, []);

  const dispatch = useCallback(
    async (update: unknown) => {
      setTyping(true);
      try {
        const r = await fetch("/api/sim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, update }),
        });
        const d = (await r.json()) as { outputs: BotOutput[] };
        // small delay for realistic bot feel
        await new Promise((res) => setTimeout(res, 280));
        applyOutputs(d.outputs ?? []);
      } catch {
        /* keep chat as-is */
      } finally {
        setTyping(false);
      }
    },
    [chatId, applyOutputs],
  );

  const sendText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setMsgs((prev) => [...prev, { mid: counter.current++, mine: true, text }]);
      setInput("");
      await dispatch({
        message: {
          message_id: counter.current++,
          from: { id: 1, first_name: profile?.label ?? "Вы" },
          chat: { id: 1, type: "private" },
          text,
        },
      });
    },
    [dispatch, profile],
  );

  const pressButton = useCallback(
    async (msg: ChatMsg, btn: InlineButton) => {
      if (!btn.callback_data) return;
      await dispatch({
        callback_query: {
          id: `cbq${counter.current++}`,
          from: { id: 1, first_name: profile?.label ?? "Вы" },
          message: { message_id: msg.mid, chat: { id: 1 } },
          data: btn.callback_data,
        },
      });
    },
    [dispatch, profile],
  );

  // boot the chat with /start
  useEffect(() => {
    if (msgs.length === 0 && profile) void sendText("/start");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    void fetch("/api/telegram/webhook")
      .then((r) => r.json())
      .then(setHookState)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  return (
    <PageShell
      title="Telegram-бот"
      subtitle="Живой симулятор продакшн-бота — тот же движок и клавиатуры, ноль настройки"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ------------------------------ chat ------------------------------ */}
        <div className="tg-chat overflow-hidden rounded-3xl border border-white/8 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/8 bg-[#17212b] px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-emerald-300 text-[#04121f]">
              <Bot size={18} strokeWidth={2.4} />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">GiftScope — сканер NFT</div>
              <div className="font-mono text-[10px] text-emerald-300">
                {typing ? "печатает…" : "в сети"}
              </div>
            </div>
            <button
              onClick={() => {
                setMsgs([]);
                void sendText("/start");
              }}
              className="rounded-lg p-2 text-[#8696a8] transition-colors hover:bg-white/8 hover:text-white"
              title="Перезапустить сессию"
            >
              <RotateCcw size={15} />
            </button>
          </div>

          <div ref={scrollRef} className="h-[480px] space-y-3 overflow-y-auto px-4 py-4">
            {msgs.map((m) => (
              <div key={m.mid} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[78%]", m.mine ? "tg-bubble-own" : "tg-bubble")}>
                  <div className="px-3.5 py-2.5 text-[13px] leading-relaxed text-[#dbe7f3]">
                    <MdLite text={m.text} />
                  </div>
                  {m.keyboard && m.keyboard.length > 0 && (
                    <div className="flex flex-col gap-1 px-1.5 pb-1.5">
                      {m.keyboard.map((row, ri) => (
                        <div key={ri} className="flex gap-1">
                          {row.map((b, bi) => (
                            <button
                              key={bi}
                              onClick={() => void pressButton(m, b)}
                              className="tg-btn flex-1 truncate rounded-md px-2 py-1.5 text-[11px] font-medium text-sky-200"
                            >
                              {b.text}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex items-center gap-1.5 text-[#8696a8]">
                <Loader2 size={13} className="animate-spin" />
                <span className="font-mono text-[10px]">бот готовит ответ…</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-white/8 bg-[#17212b] px-3 py-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void sendText(input)}
              placeholder="Сообщение — попробуйте «bear» или /admin"
              className="flex-1 rounded-full bg-[#0e1621] px-4 py-2.5 text-sm text-white placeholder:text-[#8696a8] focus:outline-none"
            />
            <button
              onClick={() => void sendText(input)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-white transition-colors hover:bg-sky-400"
            >
              <Send size={15} className="-rotate-12 translate-x-[1px]" />
            </button>
          </div>
        </div>

        {/* ------------------------------ deployment ------------------------------ */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5">
            <SectionTitle title="Статус вебхука" />
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  hookState?.tokenConfigured ? "bg-emerald-300" : "bg-amber-300",
                )}
              />
              <span className="font-mono text-xs text-[color:var(--color-dim)]">
                {hookState === null
                  ? "проверка…"
                  : hookState.tokenConfigured
                    ? "TELEGRAM_BOT_TOKEN настроен — боевой режим"
                    : "Токен не настроен — режим симуляции"}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[color:var(--color-faint)]">
              Один и тот же обработчик обновлений питает этот симулятор и боевой endpoint
              <span className="font-mono text-[10px] text-sky-300"> /api/telegram/webhook</span>.
            </p>
          </div>

          <div className="glass rounded-2xl p-5">
            <SectionTitle title="Запуск на VPS" hint="3 шага до настоящего бота" />
            <ol className="space-y-3 text-xs leading-relaxed text-[color:var(--color-dim)]">
              <li className="flex gap-2.5">
                <KeySquare size={14} className="mt-0.5 shrink-0 text-sky-300" />
                <span>
                  Создайте бота через <code className="font-mono text-[10px] text-emerald-200">@BotFather</code> и
                  задайте <code className="font-mono text-[10px] text-emerald-200">TELEGRAM_BOT_TOKEN</code> в переменных окружения.
                </span>
              </li>
              <li className="flex gap-2.5">
                <Webhook size={14} className="mt-0.5 shrink-0 text-sky-300" />
                <span>
                  Направьте Telegram на этот деплой:
                  <code className="mt-1 block break-all rounded-lg bg-black/30 p-2 font-mono text-[10px] text-emerald-200">
                    https://api.telegram.org/bot$TOKEN/setWebhook?url=$APP_URL/api/telegram/webhook&secret_token=$SECRET
                  </code>
                </span>
              </li>
              <li className="flex gap-2.5">
                <TerminalSquare size={14} className="mt-0.5 shrink-0 text-sky-300" />
                <span>
                  Укажите <code className="font-mono text-[10px] text-emerald-200">ADMIN_CHAT_ID</code> с вашим Telegram-
                  id для доступа к /admin, а <code className="font-mono text-[10px] text-emerald-200">TELEGRAM_WEBHOOK_SECRET</code> — для
                  защиты endpoint.
                </span>
              </li>
              <li className="flex gap-2.5">
                <TerminalSquare size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                <span>
                  <strong className="text-[color:var(--color-dim)]">Нет сервера или домена?</strong> Задайте{" "}
                  <code className="font-mono text-[10px] text-emerald-200">TELEGRAM_POLLING=true</code> и бот будет
                  работать в режиме long polling с любой включённой машины — без публичного адреса.
                </span>
              </li>
            </ol>
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip tone="ton">inline-клавиатуры</Chip>
            <Chip tone="ton">FSM-поиск</Chip>
            <Chip tone="ton">состояние по каждому пользователю</Chip>
            <Chip tone="mint">пуш-алерты</Chip>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
