import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const lightColors = {
  background: '#fafafb',
  surface: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  primary: '#059669',
  danger: '#EF4444',
  border: '#E6E9EE',
};

const darkColors = {
  background: '#071026',
  surface: '#0B1220',
  text: '#E6EEF8',
  muted: '#94A3B8',
  primary: '#34D399',
  danger: '#FB7185',
  border: '#102033',
};

export const themes = {
  light: { colors: lightColors },
  dark: { colors: darkColors },
};

type ThemeContextType = {
  theme: typeof themes.light;
  scheme: 'light' | 'dark';
};

const ThemeContext = createContext<ThemeContextType>({ theme: themes.light, scheme: 'light' });

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = scheme === 'dark' ? themes.dark : themes.light;

  return (
    <ThemeContext.Provider value={{ theme, scheme }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {children}
      </SafeAreaView>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeProvider;
