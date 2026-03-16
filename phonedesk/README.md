# PhoneDesk

PhoneDesk превращает второй смартфон в панель быстрого запуска приложений для Windows/Linux через локальный сервер и веб-интерфейс.

## Возможности

- Вход по PIN (4-8 цифр), JWT-сессии на 8 часов
- Защита от brute force (5 попыток за 10 минут, блок на 15 минут)
- Admin API только с `localhost` (`127.0.0.1`, `::1`)
- Каталог приложений в JSON-файле (без БД)
- Запуск/фокус приложения через стратегии `WindowsLauncher` / `LinuxLauncher`
- SSE-обновление статусов без polling (интервал не чаще 5 секунд)
- Audit-лог авторизаций и запусков в `data/audit.log`
- React UI:
  - `/pin` — ввод PIN
  - `/dashboard` — иконки запуска
  - `/admin` — CRUD приложений, сортировка drag-and-drop, сканирование, смена PIN
- PWA (manifest + service worker)

## Стек

- Backend: Node.js 20+, TypeScript, Express
- Frontend: React 18, TypeScript, Vite, TailwindCSS
- State: React Query + Zustand
- Безопасность: helmet, cors, express-rate-limit, zod, bcryptjs, jsonwebtoken

## Структура

```text
phonedesk/
├── server/
├── client/
├── data/
├── package.json
└── README.md
```

## Требования

- Node.js 20+
- npm 10+
- Windows: PowerShell 5+
- Linux: рекомендуется `wmctrl` (опционально, для фокуса окна)

## Установка

### Вариант 1 (по папкам)

```bash
cd phonedesk/server && npm install
cd ../client && npm install
```

### Вариант 2 (из корня)

```bash
cd phonedesk
npm install
cd server && npm install
cd ../client && npm install
```

## Переменные окружения

Файл: `server/.env`

```env
PORT=3000
NODE_ENV=development
```

## Запуск

### Development

```bash
cd phonedesk
npm run dev
```

- Backend: `http://localhost:3000`
- Frontend (Vite): `http://localhost:5173`

### Production

```bash
cd phonedesk
npm run build
npm start
```

- `npm run build`:
  1. собирает клиент
  2. копирует build в `server/public`
  3. собирает сервер
- `npm start` запускает только сервер, который раздаёт API и статику React

## Первый запуск

На первом запуске сервер:

1. Создаёт `data/config.json` (если отсутствует)
2. Генерирует 6-значный PIN
3. Печатает в консоль:
   - `PhoneDesk запущен! PIN для входа: XXXXXX. Смените PIN в Admin панели.`
   - `Откройте на iPhone: http://<local-ip>:3000`

После входа откройте `/admin` на ПК и смените PIN.

## API

### Auth

- `POST /api/auth/login` → `{ token, expiresInSeconds, mustChangePin }`
- `GET /api/auth/verify` → требует Bearer token
- `POST /api/auth/change-pin` → требует Bearer token + localhost

### User Apps

- `GET /api/apps` → список приложений
- `POST /api/apps/:id/launch` → запуск/фокус
- `GET /api/apps/status` → SSE статусов

### Admin Apps (localhost only)

- `GET /api/admin/apps`
- `POST /api/admin/apps`
- `PUT /api/admin/apps/:id`
- `DELETE /api/admin/apps/:id`
- `POST /api/admin/apps/scan`

## Безопасность

- `helmet` для security headers
- CORS только для localhost и private LAN диапазонов
- Global API rate limit: 100 req/min/IP
- Auth brute-force limiter в памяти
- Валидация `zod` на POST/PUT
- `Cache-Control: no-store` для `/api/*`

## Где лежат данные

- `data/apps.windows.json`
- `data/apps.linux.json`
- `data/config.json`
- `data/audit.log`

`data/` добавлена в `.gitignore`.

## Примечания по платформам

### Windows

- Проверка процесса: `tasklist`
- Фокус окна: PowerShell + `SetForegroundWindow`

### Linux

- Проверка процесса: `pgrep -x`
- Фокус окна: `wmctrl -a <window>`
- Если `wmctrl` отсутствует, используется fallback на запуск

## Проверка качества

```bash
cd phonedesk/server && npm run typecheck
cd ../client && npm run typecheck
cd .. && npm run build
```

