// Minimal set of free SVG weather icons (inline strings)
// These are small, clean SVGs used for the weather UI. Add more as needed.
const weatherSvgs: Record<string, string> = {
  sun: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="#FFB020"/><g stroke="#FFB020" stroke-width="1.2" stroke-linecap="round"><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.2 4.2l1.4 1.4"/><path d="M18.4 18.4l1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.2 19.8l1.4-1.4"/><path d="M18.4 5.6l1.4-1.4"/></g></svg>`,
  cloud: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 18h12a4 4 0 0 0 0-8 5 5 0 0 0-9.9-1.4A4 4 0 0 0 6 18z" fill="#CBD5E1"/></svg>`,
  rain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 16h12a4 4 0 0 0 0-8 5 5 0 0 0-9.9-1.4A4 4 0 0 0 6 16z" fill="#CBD5E1"/><g fill="#3B82F6"><path d="M9 19a1 1 0 0 1-1 1 1 1 0 0 1 0-2 1 1 0 0 1 1 1z"/><path d="M13 19a1 1 0 0 1-1 1 1 1 0 0 1 0-2 1 1 0 0 1 1 1z"/><path d="M17 19a1 1 0 0 1-1 1 1 1 0 0 1 0-2 1 1 0 0 1 1 1z"/></g></svg>`,
  snow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 16h12a4 4 0 0 0 0-8 5 5 0 0 0-9.9-1.4A4 4 0 0 0 6 16z" fill="#E2E8F0"/><g stroke="#60A5FA" stroke-width="1.2" stroke-linecap="round"><path d="M12 17v2"/><path d="M10 18h4"/><path d="M11 16l-1 2"/><path d="M13 16l1 2"/></g></svg>`,
  thunder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 16h12a4 4 0 0 0 0-8 5 5 0 0 0-9.9-1.4A4 4 0 0 0 6 16z" fill="#CBD5E1"/><path d="M12 8l-2 4h3l-1 4 4-5h-3z" fill="#FBBF24"/></svg>`,
  fog: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 15h16v2H4zM6 11h12v2H6z" fill="#94A3B8"/></svg>`,
};

export default weatherSvgs;
