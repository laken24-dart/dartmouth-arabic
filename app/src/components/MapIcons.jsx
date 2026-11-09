// Ink-style line icons for vocabulary themes on the path map (24×24, drawn with currentColor).
const ICONS = {
  greetings: <><path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  family: <><circle cx="8.5" cy="7.5" r="2.6" /><circle cx="16" cy="9" r="2.1" /><path d="M3.5 19c.6-3.6 2.6-5.6 5-5.6s4.4 2 5 5.6M13.2 19c.4-2.7 1.6-4.3 3-4.3s2.8 1.6 3.3 4.3" /></>,
  food: <><path d="M5 10h11v4.5a5.5 5.5 0 0 1-11 0z" /><path d="M16 11.5h1.5a2.3 2.3 0 0 1 0 4.6H15.6" /><path d="M8 3.5c-.8 1.2.8 2 0 3.3M11.5 3.5c-.8 1.2.8 2 0 3.3" /></>,
  school: <><path d="M12 6.5C9.8 5 6.8 4.6 3.5 5v13c3.3-.4 6.3 0 8.5 1.5 2.2-1.5 5.2-1.9 8.5-1.5V5c-3.3-.4-6.3 0-8.5 1.5z" /><path d="M12 6.5v13" /></>,
  places: <><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>,
  world: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z" /></>,
  numbers: <><path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15M4 15h15" /></>,
  time: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.4 2" /></>,
  weather: <><circle cx="12" cy="12" r="3.8" /><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" /></>,
  feelings: <><path d="M12 19.5s-7.5-4.6-7.5-10a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.4-7.5 10-7.5 10z" /></>,
  body: <><path d="M12 4.2c-4.6 0-8.5 3.3-8.5 7.6 0 3.6 2.7 6 5.5 6 1.6 0 1.6-1.6 3.1-1.6s1.7 3.6 4 3.6c2.4 0 4.4-3.3 4.4-8 0-4.3-3.9-7.6-8.5-7.6z" /><circle cx="8" cy="10" r="1.2" /><circle cx="12" cy="7.8" r="1.2" /><circle cx="16" cy="10" r="1.2" /></>,
  hobbies: <><circle cx="12" cy="12" r="8.5" /><path d="m12 7.6 3.3 2.4-1.3 3.9h-4l-1.3-3.9z" /><path d="M12 3.5v4.1M15.3 10l4.3-1.5M14 13.9l2.6 3.6M10 13.9l-2.6 3.6M8.7 10 4.4 8.5" /></>,
  work: <><rect x="3.5" y="7.5" width="17" height="11.5" rx="1.5" /><path d="M9 7.5V5.5h6v2M3.5 12.5h17" /></>,
  faith: <><path d="M14.5 4.2a8 8 0 1 0 5.3 13.4 6.5 6.5 0 1 1-5.3-13.4z" /><path d="m17.6 7.2.7 1.6 1.7.2-1.3 1.1.4 1.7-1.5-.9-1.5.9.4-1.7-1.3-1.1 1.7-.2z" /></>,
  verbs: <><path d="M4 12h13M13 7.5 17.5 12 13 16.5" /><path d="M3.5 7.5h4M3.5 16.5h4" /></>,
  grammar: <><path d="M15.5 4.5 19.5 8.5 9 19H5v-4z" /><path d="M13 7l4 4" /></>,
  words: <><rect x="4.5" y="4.5" width="15" height="15" rx="2" /><path d="M8 9h8M8 12h8M8 15h5" /></>,
  flag: <><path d="M6 21V4" /><path d="M6 4.5h11l-2.5 4 2.5 4H6" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  lock: <><rect x="5.5" y="10.5" width="13" height="9" rx="1.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  pencil: <><path d="M15.5 4.5 19.5 8.5 9 19H5v-4z" /></>
};

export default function MapIcon({ name, size = 24, strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] || ICONS.words}
    </svg>
  );
}
