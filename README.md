# Periodyx — AI Performance Coach

Отдельный Next.js проект для тренера S&C. Приложение помогает выбирать игрока,
генерировать тренировку или разминку на конкретный день, сохранять результат и
использовать историю нагрузок в следующих решениях.

## Связь с zarechie

Проект читает данные из того же Upstash Redis, что и основной дашборд:
WHOOP-метрики, опросники, утренние чек-ины, нейротесты и данные состава.
Сгенерированные тренировки, разминки, 1RM, фактические веса, тоннаж и библиотека
упражнений сохраняются обратно в Redis.

## Основные части

- `pages/index.js` — главный экран тренера.
- `pages/library.js` — библиотека упражнений.
- `pages/player/[id].js` — публичная карточка игрока.
- `pages/api/players/list.js` — загрузка состава.
- `pages/api/programs/generate.js` — основная генерация тренировки через OpenAI Responses API.
- `pages/api/programs/generate-warmup.js` и `pages/api/warmup/generate.js` — генерация разминки через OpenAI.
- `pages/api/programs/save.js` / `get.js` — сохранение и загрузка тренировки.
- `lib/playerData.js` — сбор данных игрока.
- `lib/redis.js` — REST-клиент Upstash Redis.

## Переменные среды

| Переменная | Назначение |
|---|---|
| `KV_REST_API_URL` | URL Upstash Redis |
| `KV_REST_API_TOKEN` | токен Upstash Redis |
| `TRAINER_API_KEY` | серверный ключ доступа тренера, если используется |
| `OPENAI_API_KEY` | ключ OpenAI для генерации тренировок, разминок и AI-помощников |
| `YOUTUBE_API_KEY` | ключ YouTube Data API для поиска видео упражнений |
| `NK_PERF_URL` | URL интеграции NK Performance |
| `NK_PERF_API_KEY` | ключ интеграции NK Performance |

## Локальный запуск

```bash
npm install
npm run dev
```

## Проверка

```bash
npm run build
```
