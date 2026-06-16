# Periodyx — AI Performance Coach

Отдельный Next.js проект, генерирующий тренировки в зале на конкретный день
для игроков (сейчас — волейбольной команды «Заречье») с помощью Claude.
Результат — печатная карточная сетка упражнений (блоки/суперсеты, картинка,
подходы, вес, техническая подсказка), как у тренера на бумаге, только живая
и редактируемая.

## Связь с проектом zarechie

Этот проект **не хранит свои данные о здоровье игроков** — он читает тот же
Upstash Redis, что и основной дашборд `zarechie` (WHOOP-метрики, опросники,
нейротесты). Поэтому переменные `KV_REST_API_URL` и `KV_REST_API_TOKEN`
должны быть скопированы из проекта zarechie в Vercel-проект zarechie-coach.
Сгенерированные/отредактированные тренировки (`coach:session:*`) и кэш
картинок упражнений (`exercise:image:*`) — это уже собственные данные Periodyx
в том же Redis.

Схема ключей Redis, общая с zarechie (см. также его `lib/redis.js` и API-роуты):
- `whoop:players` (SET id) + `whoop:player:{id}` — игроки с WHOOP
- `roster:players` (SET id) + `roster:player:{id}` — полный ростер (включая без WHOOP)
- `whoop:history:dates:{id}` (SET дат) + `whoop:history:{id}:{date}` — история WHOOP
- `survey:dates:{id}` (SET дат) + `survey:{id}:{date}` — вечерний опросник
- `survey:morning:{id}:{date}` — утренний чек-ин (без SET-индекса дат, итерация по диапазону дат)
- `neuro:data` — JSON-блоб нейротестов, ключ внутри — id игрока

Собственные ключи Periodyx в том же Redis:
- `coach:session:{playerId}:{date}` — сохранённая (возможно, отредактированная тренером) тренировка
- `exercise:image:{slug}` — сгенерированная иллюстрация упражнения, кэш навсегда по названию

## Структура

- `lib/redis.js` — REST-клиент Upstash (те же env vars, что в zarechie) + `redisPipeline` для батч-запросов
- `lib/auth.js` — проверка `x-api-key` против `TRAINER_API_KEY` (single-user, только полный доступ)
- `lib/playerData.js` — `getPlayerSnapshot(id, days, targetDate)` собирает точечные данные на день +
  тренд WHOOP/опросников/нейротестов игрока в один объект
- `pages/api/players/list.js` — список всех игроков (для выпадающего списка в UI)
- `pages/api/programs/generate.js` — основной эндпоинт: берёт снимок данных игрока на конкретный день,
  строит промпт с персоной топового S&C-тренера по волейболу и вызывает Claude (`claude-sonnet-4-6`)
  через forced tool-use, чтобы получить структурированную (не текстовую) тренировку
- `pages/api/programs/save.js` / `get.js` — сохранение/загрузка отредактированной тренером тренировки
- `pages/api/exercises/image.js` — генерация иллюстрации упражнения через Gemini, кэш в Redis по названию
- `pages/index.js` — UI: ввод API-ключа, выбор игрока/даты/цели, карточная сетка результата
  с редактируемыми полями, печатью и сохранением

## Переменные среды (Vercel)

| Переменная | Источник |
|---|---|
| `KV_REST_API_URL` | скопировать из проекта zarechie |
| `KV_REST_API_TOKEN` | скопировать из проекта zarechie |
| `TRAINER_API_KEY` | можно использовать тот же ключ, что в zarechie, или свой |
| `ANTHROPIC_API_KEY` | ключ Anthropic API (отдельно, не входит в zarechie) |
| `GEMINI_API_KEY` | ключ Google AI Studio / Gemini API — для генерации картинок упражнений |

## Деплой

Через `./deploy.sh` (обёртка над `vercel --prod` + переалиасинг на `zarechie-coach.vercel.app`).
Git remote не настроен по умолчанию (как и в zarechie).

## Локальный запуск

```bash
npm install
npm run dev
```
