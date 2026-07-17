// Minimal set of free SVG weather icons (inline strings)
// Clean Precision Gold Lineart SVGs for Kampfire Gold theme.
const weatherSvgs: Record<string, string> = {
  sun: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="none" stroke="#D4AF6A" stroke-width="1.5"/><g stroke="#D4AF6A" stroke-width="1.5" stroke-linecap="round"><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></g></svg>`,
  cloud: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 18h12a4 4 0 0 0 0-8 5 5 0 0 0-9.9-1.4A4 4 0 0 0 6 18z" fill="none" stroke="#D4AF6A" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  rain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 15h12a4 4 0 0 0 0-8 5 5 0 0 0-9.9-1.4A4 4 0 0 0 6 15z" fill="none" stroke="#D4AF6A" stroke-width="1.5"/><g stroke="#D4AF6A" stroke-width="1.5" stroke-linecap="round"><line x1="8" y1="18" x2="8" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="16" y1="18" x2="16" y2="21"/></g></svg>`,
  snow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 15h12a4 4 0 0 0 0-8 5 5 0 0 0-9.9-1.4A4 4 0 0 0 6 15z" fill="none" stroke="#D4AF6A" stroke-width="1.5"/><g stroke="#D4AF6A" stroke-width="1.5" stroke-linecap="round"><path d="M12 17v3"/><path d="M10 18.5h4"/><path d="M11 16.5l-1 2"/><path d="M13 16.5l1 2"/></g></svg>`,
  thunder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 15h12a4 4 0 0 0 0-8 5 5 0 0 0-9.9-1.4A4 4 0 0 0 6 15z" fill="none" stroke="#D4AF6A" stroke-width="1.5"/><path d="M12 8l-2 5h3l-1 5 4-6h-3z" fill="none" stroke="#E8C97A" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  fog: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 14h16M6 10h12M8 18h8" stroke="#D4AF6A" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

export default weatherSvgs;
