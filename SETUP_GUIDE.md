# 🧬 GENESIS — Полный гайд по запуску
### От нуля до продакшна без бекендера

---

## Что у нас есть

```
genesis/
├── frontend/
│   ├── index.html       ← Лендинг (Vercel)
│   └── dashboard.html   ← Дашборд (Vercel)
└── backend/
    ├── server.js        ← Главный сервер
    ├── debate-engine.js ← AI агенты (DeepSeek)
    ├── dao.js           ← DAO голосования
    ├── market.js        ← Цена токена (DexScreener)
    ├── helius.js        ← Whale алерты, holders
    ├── package.json
    └── .env.example
```

**Фронт** → деплоится на **Vercel** (бесплатно)
**Бек** → деплоится на **Railway** (от $5/мес)

---

## ШАГ 1 — Получи все API ключи (15 минут)

### 1.1 DeepSeek API
1. Открой → **https://platform.deepseek.com**
2. Sign Up → верифицируй email
3. API Keys → Create new key
4. Скопируй ключ (начинается с `sk-`)
5. Пополни баланс — $5 хватит на месяцы работы

### 1.2 Helius API (у тебя уже есть)
1. Открой → **https://dashboard.helius.xyz**
2. Создай новый проект (или используй существующий)
3. Скопируй **API Key** из настроек проекта
4. Убедись что стоит тариф с вебхуками (Developer+)

### 1.3 Аккаунт Railway (для бекенда)
1. Открой → **https://railway.app**
2. Sign Up через GitHub (обязательно GitHub!)
3. Добавь платёжный метод (нужен для деплоя)

### 1.4 Аккаунт Vercel (для фронта)
1. Открой → **https://vercel.com**
2. Sign Up через GitHub
3. Бесплатно, ничего платить не нужно

---

## ШАГ 2 — Подготовь код (5 минут)

### 2.1 Установи Git (если нет)
- Mac: уже есть
- Windows: скачай **https://git-scm.com/download/win**

### 2.2 Создай GitHub репозиторий
1. Открой → **https://github.com/new**
2. Repository name: `genesis-council`
3. Private (рекомендую) → Create repository
4. Запомни URL репо: `https://github.com/ТВОЙ_ЮЗЕР/genesis-council`

### 2.3 Загрузи код на GitHub
Открой терминал (Mac: Terminal, Windows: Git Bash) в папке с проектом:

```bash
git init
git add .
git commit -m "Initial GENESIS deployment"
git branch -M main
git remote add origin https://github.com/ТВОЙ_ЮЗЕР/genesis-council.git
git push -u origin main
```

---

## ШАГ 3 — Деплой бекенда на Railway (10 минут)

### 3.1 Создай проект
1. Открой → **https://railway.app/new**
2. Нажми **"Deploy from GitHub repo"**
3. Выбери `genesis-council`
4. Railway спросит какую папку деплоить → выбери `/backend`

### 3.2 Настрой переменные окружения
В Railway → твой проект → **Variables** → **Add Variable**:

Добавляй по одной:

| Variable | Value |
|----------|-------|
| `TOKEN_ADDRESS` | Mint адрес твоего токена (с pump.fun) |
| `DEEPSEEK_API_KEY` | sk-твой_ключ |
| `HELIUS_API_KEY` | твой_helius_ключ |
| `WEBHOOK_SECRET` | придумай любую строку, например: `genesis-secret-777` |
| `PORT` | `3001` |

### 3.3 Получи URL бекенда
После деплоя Railway даёт URL вида:
`genesis-council-production.up.railway.app`

Запиши этот URL — он нужен на следующих шагах.

### 3.4 Добавь WEBHOOK_URL (после получения URL)
В Railway Variables добавь ещё одну переменную:
```
WEBHOOK_URL = https://genesis-council-production.up.railway.app
```
Потом нажми **Redeploy** (сверху справа).

---

## ШАГ 4 — Настрой Helius Webhook (5 минут)

После того как бекенд задеплоен на Railway:

1. Открой → **https://dashboard.helius.xyz**
2. Твой проект → **Webhooks** → **New Webhook**
3. Заполни:
   - **Webhook URL**: `https://genesis-council-production.up.railway.app/webhook/helius`
   - **Transaction Types**: отметь `SWAP` и `TRANSFER`
   - **Account Addresses**: вставь mint адрес своего токена
   - **Auth Header**: вставь ту же строку что в `WEBHOOK_SECRET`
4. Нажми **Create Webhook**

Готово! Теперь при каждой покупке/продаже токена — Helius шлёт сигнал на твой сервер, Sentinel или Oracle реагируют в дашборде через несколько секунд.

---

## ШАГ 5 — Обнови фронт (2 минуты)

Открой файл `frontend/dashboard.html` в любом текстовом редакторе (Notepad, VS Code).

Найди строку:
```javascript
: 'wss://ВСТАВЬ_RAILWAY_URL_СЮДА';
```

Замени на твой Railway URL:
```javascript
: 'wss://genesis-council-production.up.railway.app';
```

Открой `frontend/index.html`, найди:
```html
data-addr="SOON"
```
Когда создашь токен на pump.fun — замени `SOON` на реальный mint адрес.

Также найди ссылку на Twitter и замени:
```html
href="https://x.com/GenesisAICouncil"
```
на свой X аккаунт.

---

## ШАГ 6 — Деплой фронта на Vercel (5 минут)

### 6.1 Деплой через сайт (самый простой способ)
1. Открой → **https://vercel.com/new**
2. Import Git Repository → выбери `genesis-council`
3. **Root Directory** → выбери `frontend`
4. **Framework Preset** → Other (или No Framework)
5. Нажми **Deploy**

### 6.2 Получи URL
Vercel даёт красивый URL вроде:
`genesis-council.vercel.app`

Это и есть твой сайт! 🎉

### 6.3 Кастомный домен (опционально)
В Vercel → Project → Settings → Domains → Add:
`genesisai.xyz` (или любой твой домен)

---

## ШАГ 7 — Создай токен на pump.fun (когда будешь готов)

1. Открой → **https://pump.fun**
2. Connect кошелёк (Phantom/Solflare)
3. Launch a coin → заполни:
   - **Name**: Genesis
   - **Symbol**: GENESIS
   - **Image**: логотип
   - **Description**: Governed by AI. Grown, not made.
4. Create coin → подтверди транзакцию
5. Скопируй mint адрес (будет в URL страницы токена)
6. Замени в `index.html`: `data-addr="SOON"` → `data-addr="ТВОЙ_MINT_АДРЕС"`
7. Замени в `backend/.env` (Railway Variables): `TOKEN_ADDRESS` → твой mint адрес
8. `git push` → Vercel автоматически обновит фронт

---

## Как обновлять сайт после изменений

Любое изменение файлов → `git push` → Vercel и Railway автоматически деплоят новую версию.

```bash
# После любых изменений:
git add .
git commit -m "Update"
git push
```

Всё. Больше ничего делать не нужно.

---

## Проверка что всё работает

После деплоя открой в браузере:
```
https://ТВОЙ_RAILWAY_URL.up.railway.app/api/health
```

Должно вернуть:
```json
{
  "status": "online",
  "agents": 4,
  "clients": 0,
  "helius": true,
  "market": false
}
```

- `helius: true` → Helius подключён
- `market: true` → токен найден на DEX (до листинга будет `false`, это нормально)

---

## Что происходит автоматически после всего этого

| Событие | Что произойдёт на сайте |
|---------|------------------------|
| Кто-то покупает токен | Oracle или Grok говорят об этом в чате через 2-3 сек |
| Кит покупает (>$5K) | Sentinel бьёт тревогу, OpenClaw говорит EXECUTE |
| Кит продаёт (>$5K) | Sentinel включает алерт, агенты обсуждают риск |
| DAO таймер истекает | Публичный лог пишет результат голосования |
| Цена меняется | Метрики обновляются каждые 10 секунд |
| Токен листится на Raydium | Данные автоматически переключаются на Raydium пару |

---

## Цены на инфраструктуру

| Сервис | Цена | Что даёт |
|--------|------|---------|
| Vercel | Бесплатно | Хостинг фронта |
| Railway | ~$5-10/мес | Бекенд 24/7 |
| DeepSeek API | ~$1-3/мес | Реальные AI ответы |
| Helius | У тебя есть | Whale алерты, holders |
| **Итого** | **~$6-13/мес** | |

---

## Нужна помощь?

Если что-то не работает — проверь логи:
- **Railway**: проект → Deployments → последний деплой → View Logs
- **Vercel**: проект → Deployments → последний → Functions (если есть ошибки)

Ошибки в логах Railway выглядят так:
```
[Helius] No API_KEY — disabled    ← не добавил HELIUS_API_KEY в Variables
[Market] Token not found          ← токен ещё не на DEX (нормально до листинга)
[WS] Connected. Total: 1          ← кто-то открыл дашборд (всё работает!)
```

---

*GENESIS Council — Governed by Intelligence. Grown, not made.*
