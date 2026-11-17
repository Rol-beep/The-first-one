const paths = {
  travel: "M3 12.5 21 3l-6 18-3.5-8.5L3 12.5Zm8.5 0L21 3",
  theme: "M12 3a9 9 0 1 0 9 9 9 9 0 0 1-9-9Z",
  logout: "M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5m5-12 4 4-4 4m4-4H9",
  chat: "M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.4-.7L4 20l1.2-4.4a8 8 0 1 1 14.8-4.1ZM9 11.5h6",
  analysis: "M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9l-6-6Zm0 0v6h6M9 13h6m-6 4h4",
  send: "M12 19V5m-6 6 6-6 6 6",
  stop: "M7 7h10v10H7z",
  attach: "m8 12 6-6a3 3 0 0 1 4 4l-8 8a4 4 0 0 1-6-6l8-8m-4 8-2 2a1.5 1.5 0 0 0 2 2l7-7",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 8.5h.01",
  ideas: "M9 18h6m-5 3h4m-5-6c0-2-3-2.5-3-6a6 6 0 0 1 12 0c0 3.5-3 4-3 6",
  remove: "m6 6 12 12M18 6 6 18",
};

export default function ActionIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="22" height="22"
      fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
