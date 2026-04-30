import { createContext, useContext, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState(i18n.language === 'es' ? 'es' : 'en');

  const toggleLang = useCallback(() => {
    const next = lang === 'en' ? 'es' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('medassist_lang', next);
    setLang(next);
  }, [lang, i18n]);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider');
  return ctx;
}
