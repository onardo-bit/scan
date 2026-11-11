import { Rocket, GitBranch, Database, KeyRound, Globe, RefreshCcw, MessageSquare } from "lucide-react";
import { PageShell, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-emerald-200">
      {children}
    </code>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rise rounded-2xl p-5" style={{ animationDelay: `${n * 60}ms` }}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400/30 to-emerald-300/20 font-mono text-xs font-bold text-sky-200">
          {n}
        </span>
        <Icon size={16} className="shrink-0 text-[color:var(--color-faint)]" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-2 pl-11 text-xs leading-relaxed text-[color:var(--color-dim)]">
        {children}
      </div>
    </div>
  );
}

export default function DeployPage() {
  return (
    <PageShell
      title="Деплой на Railway"
      subtitle="Из GitHub в живого бота за ~10 минут, без Docker и CLI"
      actions={
        <span className="flex flex-wrap gap-2">
          <Chip tone="mint">бесплатный старт</Chip>
          <Chip tone="ton">автопересборка по git push</Chip>
        </span>
      }
    >
      <div className="mx-auto max-w-2xl space-y-3">
        <Step n={0} icon={MessageSquare} title="Подготовка">
          <p>
            Создайте бота у <Code>@BotFather</Code> → <Code>/newbot</Code> → скопируйте токен.
          </p>
          <p>
            Свой Telegram id узнайте у <Code>@userinfobot</Code> — понадобится для /admin.
          </p>
        </Step>

        <Step n={1} icon={GitBranch} title="Залейте код на GitHub">
          <pre className="overflow-x-auto rounded-xl bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-emerald-200">
{`git init
git add -A
git commit -m "GiftScope scanner"
git branch -M main
git remote add origin https://github.com/ВЫ/giftscope.git
git push -u origin main`}
          </pre>
          <p>Репозиторий предварительно создайте на github.com (пустой, публичный или приватный).</p>
        </Step>

        <Step n={2} icon={Database} title="Создайте проект на Railway">
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              Зайдите на <Code>railway.com</Code> → Login with GitHub
            </li>
            <li>
              <strong>New Project</strong> → сначала <strong>Provision PostgreSQL</strong>
            </li>
            <li>
              В сервисе PostgreSQL → <strong>Variables</strong> → скопируйте <Code>DATABASE_URL</Code>
            </li>
            <li>
              <strong>New</strong> → <strong>GitHub Repo</strong> → выберите репозиторий → Deploy
            </li>
          </ol>
        </Step>

        <Step n={3} icon={KeyRound} title="Переменные окружения сервиса">
          <div className="overflow-hidden rounded-xl border border-white/8">
            {[
              ["DATABASE_URL", "URL из шага 2", "база данных"],
              ["TELEGRAM_BOT_TOKEN", "токен @BotFather", "живой бот"],
              ["TELEGRAM_POLLING", "true", "бот без webhook-сложностей"],
              ["ADMIN_CHAT_ID", "ваш Telegram id", "/admin в боте"],
              ["ADMIN_CODE", "любой секрет", "веб-админка"],
              ["PORTALS_AUTH_DATA", "опционально", "источник Portals"],
            ].map(([k, v, why], i) => (
              <div
                key={k}
                className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3.5 py-2.5 sm:grid-cols-[200px_1fr_120px] ${
                  i % 2 ? "bg-white/[0.02]" : ""
                }`}
              >
                <span className="font-mono text-[11px] font-semibold text-sky-300">{k}</span>
                <span className="font-mono text-[11px] text-[color:var(--color-dim)]">{v}</span>
                <span className="hidden text-right font-mono text-[10px] text-[color:var(--color-faint)] sm:block">
                  {why}
                </span>
              </div>
            ))}
          </div>
        </Step>

        <Step n={4} icon={Rocket} title="Автоматика при старте">
          <p>
            Скрипт <Code>npm start</Code> сам выполняет <Code>drizzle-kit push --force</Code> —
            таблицы создаются без ручных миграций. Дальше: каталог сидится, планировщик скана
            запускается, polling подключается к Telegram.
          </p>
          <p>
            Проверка: откройте бота в Telegram → <Code>/start</Code> → меню на русском.
          </p>
        </Step>

        <Step n={5} icon={Globe} title="Обновления и веб-консоль">
          <p>
            Обычный <Code>git push</Code> → Railway пересобирает и перезапускает всё за ~2 минуты.
            База и настройки пользователей сохраняются.
          </p>
          <p>
            Нужна веб-консоль из интернета? Settings → Public Networking →{" "}
            <strong>Generate Domain</strong> — получите URL вида{" "}
            <Code>…up.railway.app</Code>.
          </p>
        </Step>

        <div className="glass rise rounded-2xl border-amber-300/20 p-5" style={{ animationDelay: "380ms" }}>
          <div className="flex items-start gap-3">
            <RefreshCcw size={15} className="mt-0.5 shrink-0 text-amber-300" />
            <div className="text-xs leading-relaxed text-[color:var(--color-dim)]">
              <strong className="text-amber-200">Если бот молчит:</strong> проверьте{" "}
              <Code>TELEGRAM_BOT_TOKEN</Code> и <Code>TELEGRAM_POLLING=true</Code>, а в логах сервиса
              ищите строку «long polling запущен». Если в /admin источник помечен как demo-фид —
              значит API Tonnel недоступен с хостинга, движок честно перешёл на встроенный фид.
              Полная инструкция лежит в файле <Code>RAILWAY.md</Code> в репозитории.
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
