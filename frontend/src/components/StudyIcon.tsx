export default function StudyIcon({ name }: { name: 'book' | 'room' | 'mistake' | 'settings' | 'back' }) {
  const paths = {
    book: <><path d="M5 4h13v15H5a2 2 0 0 1 0-4h13M5 4a2 2 0 0 0-2 2v11M8 4v8l3-2 3 2V4" /></>,
    room: <><path d="M3 11h18M5 11v10m14-10v10M7 11V7h6v4m4-1 3-6-4-2-3 6m3 0 1 2M5 17h14" /></>,
    mistake: <><path d="M13 21H4V3h14v9M8 7h6M8 11h4"/><circle cx="17" cy="17" r="5"/><path d="m15 15 4 4m0-4-4 4" /></>,
    settings: <><path d="m10 3-1 3-3 1-3 3 2 2-1 4 3 2 3-1 2 4 3-1 1-3 4-1 1-3-3-2 1-3-3-2-3 1-1-4z"/><circle cx="12" cy="12" r="3"/></>,
    back: <path d="m14 5-7 7 7 7M7 12h14" />,
  }
  return <svg className="study-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
