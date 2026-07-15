import React, { createContext, useContext, useMemo, useState } from 'react';
import { createTheme, ThemeProvider, useMediaQuery, CssBaseline } from '@mui/material';

const THEME_KEY = 'weedtown_theme';

const colorModeContext = createContext({ mode: 'light', toggle: () => {} });

export function useColorMode() {
  return useContext(colorModeContext);
}

// Paleta tomada del logo: hojas lima→verde profundo, edificios carbón/plata,
// swoosh degradado. Claro = blanco con tinte hoja; oscuro = carbón verdoso.
const BRAND_GRADIENT = 'linear-gradient(90deg, #8bc34a 0%, #388e3c 55%, #455a64 100%)';

function getTheme(mode) {
  return createTheme({
    palette: {
      mode,
      ...(mode === 'light'
        ? {
            primary: { main: '#33691e', light: '#7cb342', dark: '#1b5e20' }, // verde hoja 900 — AA sobre blanco
            secondary: { main: '#455a64' },    // carbón azulado de los edificios
            background: { default: '#f5f8f2', paper: '#ffffff' },
            text: { primary: '#1e271e', secondary: '#546e7a' }
          }
        : {
            primary: { main: '#9ccc65', light: '#cfff95', dark: '#7cb342' }, // lima 400 — AA sobre superficies oscuras
            secondary: { main: '#b0bec5' },    // plata/carbón claro
            background: { default: '#0f130f', paper: '#171d17' },
            text: { primary: '#e8f0e3', secondary: '#a5b8a5' }
          })
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h4: { fontFamily: '"Nunito", "Roboto", sans-serif', fontWeight: 800 },
      h5: { fontFamily: '"Nunito", "Roboto", sans-serif', fontWeight: 800 },
      h6: { fontFamily: '"Nunito", "Roboto", sans-serif', fontWeight: 700 },
      button: { fontFamily: '"Nunito", "Roboto", sans-serif', textTransform: 'none', fontWeight: 700 }
    },
    components: {
      MuiCard: { defaultProps: { elevation: 1 } },
      MuiButton: { defaultProps: { disableElevation: true } },
      // El swoosh del logo como acento inferior de la barra de navegación
      MuiAppBar: {
        styleOverrides: {
          root: {
            borderBottom: '3px solid transparent',
            borderImage: `${BRAND_GRADIENT} 1`
          }
        }
      }
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
