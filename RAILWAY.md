# Деплой на Railway через GitHub

Пошагово, без Docker-файлов и CLI. Результат: бот + веб-консоль + PostgreSQL 24/7.

## 0. Подготовка (2 мин)

1. Создайте бота у **@BotFather** → `/newbot` → скопируйте токен (`123456:ABC…`).
2. Узнайте свой Telegram id: напишите боту **@userinfobot** → он вернёт число.

## 1. Залить код на GitHub (3 мин)

В папке проекта:

```bash
git init
echo "node_modules/
.next/
.env" > .gitignore
git add -A
git commit -m "GiftScope scanner"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/giftscope.git   # создайте пустой репозиторий на github.com
git push -u origin main
```

## 2. Создать проект на Railway (5 мин)

1. Зайдите на https://railway.com → **Login with GitHub**.
2. **New Project** → выберите **Provision PostgreSQL** (сначала БД).
   - Откройте сервис PostgreSQL → вкладка **Variables** → скопируйте `DATABASE_URL` (вида `postgresql://postgres:...@...proxy.rlwy.net:.../railway`).
3. **New** → **GitHub Repo** → выберите `giftscope` → Deploy.

## 3. Переменные окружения

Откройте сервис приложения → **Variables** → добавьте:

| Переменная | Значение | Зачем |
|---|---|---|
| `DATABASE_URL` | скопированный URL из PostgreSQL | база данных |
| `TELEGRAM_BOT_TOKEN` | токен от @BotFather | живой бот |
| `TELEGRAM_POLLING` | `true` | бот без сложностей с портами/VPN |
| `ADMIN_CHAT_ID` | ваш числовой Telegram id | доступ к /admin в боте |
| `ADMIN_CODE` | любой секрет | вход в веб-админку /admin |
| `PORTALS_AUTH_DATA` | опционально | второй источник цен (Portals) |

> Рекомендация: `TELEGRAM_POLLING=true` + публичный домен приложения выключен можно и не включать.
> Если хотите веб-консоль из интернета — в настройках сервиса **Settings → Public Networking → Generate Domain**,
> тогда получите URL вида `giftscope-production.up.railway.app`.

## 4. Что происходит при деплое (автоматически)

1. Railway видит `package.json` → собирает через Nixpacks (`npm ci` → `npm run build`).
2. На старте `npm start` выполняет `drizzle-kit push --force` — **таблицы создаются сами**.
3. Приложение поднимается, сидится каталог из 47 коллекций, запускается планировщик скана.
4. Polling-цикл подключается к Telegram — бот живой.

Проверка: откройте бота в Telegram → `/start` → должно прийти меню на русском.

## 5. Обновления потом

Обычный `git push` → Railway сам пересобирает и перезапускает всё за ~2 минуты.
База и настройки пользователей сохраняются.

## Если что-то не так

- **Build failed** → Railway → Deployments → лог сборки (обычно не хватило RAM или опечатка в env).
- **Бот молчит** → проверьте `TELEGRAM_BOT_TOKEN` и что `TELEGRAM_POLLING=true`; в логах сервиса ищите строку `long polling запущен`.
- **Ошибки БД** → убедитесь, что `DATABASE_URL` скопирован без пробелов и указывает на сервис PostgreSQL этого же проекта.
- **Цены симулируются, а не Tonnel** → на Railway может не быть доступа к gifts2.tonnel.network (страновые блоки API). Тогда движок автоматически работает на demo-фиде — это видно в /admin. Живой Tonnel-фид лучше всего работает с VPS в Европе.
