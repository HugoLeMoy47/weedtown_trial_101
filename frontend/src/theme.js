import React, { createContext, useContext, useMemo, useState } from 'react';
import { createTheme, ThemeProvider, useMediaQuery, CssBaseline } from '@mui/material';

const THEME_KEY = 'weedtown_theme';

const colorModeContext = createContext({ mode: 'light', toggle: () => {} });

export function useColorMode() {
  return useContext(colorModeContext);
}

// Paleta Material: claro = blanco + verde con acentos gris; oscuro adaptado a esa paleta
function getTheme(mode) {
  return createTheme({
    palette: {
      mode,
      ...(mode === 'light'
        ? {
            primary: { main: '#2e7d32' },      // verde 800 — AA sobre blanco
            secondary: { main: '#616161' },    // gris 700
            background: { default: '#fafafa', paper: '#ffffff' },
            text: { primary: '#212121', secondary: '#616161' }
          }
        : {
            primary: { main: '#81c784' },      // verde 300 — AA sobre superficies oscuras
            secondary: { main: '#bdbdbd' },    // gris 400
            background: { default: '#121212', paper: '#1e1e1e' },
            text: { primary: '#eeeeee', secondary: '#bdbdbd' }
          })
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 }
    },
    components: {
      MuiCard: { defaultProps: { elevation: 1 } },
      MuiButton: { defaultProps: { disableElevation: true } }
    }
  });
}

export function ColorModeProvider({ children }) {
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [override, setOverride] = useState(() => localStorage.getItem(THEME_KEY) || null);

  const mode = override || (systemPrefersDark ? 'dark' : 'light');

  const value = useMemo(() => ({
    mode,
    toggle: () => {
      const next = mode === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, next);
      setOverride(next);
    }
  }), [mode]);

  const theme = useMemo(() => getTheme(mode), [mode]);

  return (
    <colorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </colorModeContext.Provider>
  );
}
