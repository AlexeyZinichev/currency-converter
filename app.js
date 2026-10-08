// --- 1. НАСТРОЙКИ И КЭШ ---
const API_BASE = 'https://api.frankfurter.app';
const CACHE_KEY_RATES = 'app_rates_cache';
const CACHE_KEY_BASE = 'app_default_base';
const CACHE_DURATION = 15 * 60 * 1000; // 15 минут в миллисекундах

// --- 2. ССЫЛКИ НА DOM-ЭЛЕМЕНТЫ (для скорости и удобства) ---
const pageConverter = document.getElementById('page-converter');
const pageRates = document.getElementById('page-rates');
const converterBtn = document.getElementById('converter-btn');
const ratesBtn = document.getElementById('rates-btn');
const converterInput = document.getElementById('converter-input');
const converterResult = document.getElementById('converter-result');
const swapBtn = document.getElementById('swap-btn');

const baseSelect = document.getElementById('base-select');
const searchInput = document.getElementById('search-input');
const ratesBody = document.getElementById('rates-body');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const defaultBaseSelect = document.getElementById('default-base-select');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

// --- 3. СОСТОЯНИЕ ПРИЛОЖЕНИЯ ---
let appState = {
    rates: {}, // Сюда будем складывать курсы { USD: 75.5, EUR: 88.2 }
    baseCurrency: 'RUB', // Базовая валюта для страницы курсов
};

// --- 4. СЕРВИС ДЛЯ РАБОТЫ С API И КЭШЕМ ---
const CurrencyService = {
    // Получаем данные из кэша, если они валидны
    getCachedRates() {
        const data = localStorage.getItem(CACHE_KEY_RATES);
        if (!data) return null;
        const { timestamp, rates } = JSON.parse(data);
        if (Date.now() - timestamp > CACHE_DURATION) return null;
        return rates;
    },

    // Сохраняем данные в кэш
    setCachedRates(rates) {
        localStorage.setItem(CACHE_KEY_RATES, JSON.stringify({
            timestamp: Date.now(),
            rates: rates
        }));
    },

    // Основной запрос к API
    async fetchLatest(base = 'RUB') {
        // Сначала проверяем кэш
        const cached = this.getCachedRates();
        if (cached) return cached;

        try {
            const response = await fetch(`${API_BASE}/latest?from=${base}`);
            if (!response.ok) throw new Error('Ошибка сети');
            const data = await response.json();
            
            this.setCachedRates(data.rates);
            return data.rates;
        } catch (error) {
            console.error('API Error:', error);
            // Если API упал, пробуем отдать хоть что-то из кэша
            const cachedFallback = this.getCachedRates();
            if (cachedFallback) return cachedFallback;
            throw error; // Если и кэша нет — выбрасываем ошибку
        }
    },

    // Конвертация (делается на клиенте, без запроса к API для скорости)
    convert(amount, from, to) {
        if (!appState.rates[to]) return null;
        // Сначала переводим в базовую валюту (она у нас в appState.baseCurrency, например RUB)
        const amountInBase = amount / appState.rates[from];
        // Затем из базовой в целевую
        return amountInBase * appState.rates[to];
    }
};

// --- 5. UI МОДУЛИ (ОТРИСОВКА И ЛОГИКА СТРАНИЦ) ---

const UI = {
    // Переключение страниц (роутер)
    navigate(page) {
        pageConverter.classList.toggle('active', page === 'converter');
        pageRates.classList.toggle('active', page === 'rates');
        converterBtn.classList.toggle('active', page === 'converter');
        ratesBtn.classList.toggle('active', page === 'rates');
        
        // Обновляем URL без перезагрузки (важно для SPA)
        window.history.pushState({ page }, '', page === 'converter' ? '/' : '/rates');
        
        if (page === 'rates') {
            this.renderRatesTable();
        }
    },

    // Инициализация выпадающих списков валют
    populateCurrencySelects() {
        const currencies = Object.keys(appState.rates);
        [baseSelect, defaultBaseSelect].forEach(select => {
            select.innerHTML = '';
            currencies.forEach(code => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = code;
                if (code === appState.baseCurrency) option.selected = true;
                select.appendChild(option);
            });
        });
    },

    // Отрисовка таблицы курсов
    renderRatesTable() {
        const currencies = Object.keys(appState.rates).sort();
        const searchTerm = searchInput.value.toLowerCase().trim();

        ratesBody.innerHTML = '';

        currencies.forEach(code => {
            if (code === appState.baseCurrency) return; // Не показываем курс базовой валюты к самой себе
            if (code.toLowerCase().includes(searchTerm) || searchTerm === '') {
                const row = document.createElement('tr');
                const rate = appState.rates[code].toFixed(4);
                row.innerHTML = `
                    <td>${code}</td>
                    <td>${this.getCurrencyName(code)}</td>
                    <td>${rate}</td>
                `;
                ratesBody.appendChild(row);
            }
        });
    },

    // Красивые названия валют (опционально, но дает плюс к интерфейсу)
    getCurrencyName(code) {
        const names = {
            USD: 'Доллар США', EUR: 'Евро', RUB: 'Российский рубль',
            CNY: 'Китайский юань', GBP: 'Фунт стерлингов', 
            KZT: 'Казахстанский тенге', BYN: 'Белорусский рубль'
        };
        return names[code] || code;
    },

    // Логика конвертера
    handleConversion() {
        const text = converterInput.value.trim().toLowerCase();
        
        // Регулярное выражение для парсинга "15 usd in rub"
        const regex = /^(\d+(?:[.,]\d+)?)\s*([a-z]{3})\s*in\s*([a-z]{3})$/;
        const match = text.match(regex);

        if (!match) {
            converterResult.textContent = 'Используйте формат: 15 usd in rub';
            converterResult.style.color = '#d32f2f';
            return;
        }

        const [, amountStr, from, to] = match;
        const amount = parseFloat(amountStr.replace(',', '.'));

        // Используем сервис для расчета
        const result = CurrencyService.convert(amount, from.toUpperCase(), to.toUpperCase());

        if (result === null) {
            converterResult.textContent = 'Данные валют еще загружаются...';
            converterResult.style.color = '#ff9800';
        } else {
            converterResult.textContent = `${amount.toFixed(2)} ${from.toUpperCase()} ≈ ${result.toFixed(2)} ${to.toUpperCase()}`;
            converterResult.style.color = '#1a73e8';
        }
    }
};

// --- 6. ОБРАБОТЧИКИ СОБЫТИЙ ---

// Навигация
converterBtn.addEventListener('click', () => UI.navigate('converter'));
ratesBtn.addEventListener('click', () => UI.navigate('rates'));

// Конвертер
converterInput.addEventListener('input', () => UI.handleConversion());
swapBtn.addEventListener('click', () => {
    const text = converterInput.value.toLowerCase();
    const regex = /^(\d+(?:[.,]\d+)?)\s*([a-z]{3})\s*in\s*([a-z]{3})$/;
    const match = text.match(regex);
    if (match) {
        const [, amount, from, to] = match;
        converterInput.value = `${amount} ${to} in ${from}`;
        UI.handleConversion();
    }
});

// Курсы
baseSelect.addEventListener('change', async (e) => {
    appState.baseCurrency = e.target.value;
    appState.rates = await CurrencyService.fetchLatest(appState.baseCurrency);
    UI.populateCurrencySelects(); // Обновить селекты, чтобы сменить "выбранный"
    UI.renderRatesTable();
});
searchInput.addEventListener('input', () => UI.renderRatesTable());

// Настройки
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
saveSettingsBtn.addEventListener('click', () => {
    const newBase = defaultBaseSelect.value;
    localStorage.setItem(CACHE_KEY_BASE, newBase);
    appState.baseCurrency = newBase;
    settingsModal.classList.add('hidden');
    // Обновляем курсы с новой базовой валютой
    CurrencyService.fetchLatest(appState.baseCurrency).then(rates => {
        appState.rates = rates;
        UI.populateCurrencySelects();
        if (pageRates.classList.contains('active')) {
            UI.renderRatesTable();
        }
    });
});

// Закрытие модалки по клику вне контента
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// --- 7. ЗАПУСК ПРИЛОЖЕНИЯ (INIT) ---
async function initApp() {
    // 1. Определяем базовую валюту (из настроек или по языку браузера)
    const savedBase = localStorage.getItem(CACHE_KEY_BASE);
    if (savedBase) {
        appState.baseCurrency = savedBase;
    } else {
        appState.baseCurrency = navigator.language === 'ru-RU' ? 'RUB' : 'USD';
    }

    // 2. Загружаем курсы (показываем пользователю "скелет", пока грузится)
    try {
        appState.rates = await CurrencyService.fetchLatest(appState.baseCurrency);
    } catch {
        converterResult.textContent = 'Не удалось загрузить данные. Проверьте интернет.';
        return;
    }

    // 3. Первичная отрисовка UI
    UI.populateCurrencySelects();
    
    // 4. Роутер: определяем, на какой странице мы находимся
    const path = window.location.pathname;
    if (path === '/rates') {
        UI.navigate('rates');
    } else {
        UI.navigate('converter');
    }
}

// Запуск
initApp();

// Обработка кнопок "Назад/Вперед" в браузере
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.page) {
        UI.navigate(event.state.page);
    } else {
        UI.navigate('converter');
    }
});
