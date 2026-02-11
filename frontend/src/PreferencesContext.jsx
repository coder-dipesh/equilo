import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'equilo_preferences';

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'INR', symbol: '₹', label: 'INR (₹)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
  { code: 'CAD', symbol: 'C$', label: 'CAD (C$)' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥)' },
];

const START_OF_WEEK_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
];

function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const currency = CURRENCIES.find((c) => c.code === data.currency?.code) || CURRENCIES[0];
    const startOfWeek = data.startOfWeek === 'sunday' ? 'sunday' : 'monday';
    return { currency, startOfWeek };
  } catch {
    return null;
  }
}

function savePreferences(currency, startOfWeek) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currency: currency ? { code: currency.code, symbol: currency.symbol, label: currency.label } : null,
        startOfWeek: startOfWeek || 'monday',
      })
    );
  } catch {}
}

const defaultCurrency = CURRENCIES[0];
const PreferencesContext = createContext({
  currency: defaultCurrency,
  startOfWeek: 'monday',
  setCurrency: () => {},
  setStartOfWeek: () => {},
  currencies: CURRENCIES,
  startOfWeekOptions: START_OF_WEEK_OPTIONS,
});

export function PreferencesProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    const saved = loadPreferences();
    return saved?.currency || defaultCurrency;
  });
  const [startOfWeek, setStartOfWeekState] = useState(() => {
    const saved = loadPreferences();
    return saved?.startOfWeek || 'monday';
  });

  useEffect(() => {
    savePreferences(currency, startOfWeek);
  }, [currency, startOfWeek]);

  const setCurrency = useCallback((c) => {
    const next = typeof c === 'string' ? CURRENCIES.find((x) => x.code === c) || defaultCurrency : c;
    setCurrencyState(next);
  }, []);

  const setStartOfWeek = useCallback((v) => {
    setStartOfWeekState(v === 'sunday' ? 'sunday' : 'monday');
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        currency,
        startOfWeek,
        setCurrency,
        setStartOfWeek,
        currencies: CURRENCIES,
        startOfWeekOptions: START_OF_WEEK_OPTIONS,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
