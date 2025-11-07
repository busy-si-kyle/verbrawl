'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: ReactNode;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: 'dark',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  ...props
}: Omit<ThemeProviderProps, 'defaultTheme' | 'storageKey'>) {
  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');
    root.classList.add('dark'); // Always add dark class
  }, []);

  // Always enforce dark theme
  useEffect(() => {
    // No need to setTheme here since we initialize to 'dark' and never change it
  }, []);

  const value: ThemeProviderState = {
    theme: 'dark', // Always return dark
    setTheme: () => {}, // No-op since theme is always dark
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};