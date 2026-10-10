// Drawn in pt: a 116x143 card frame, an inset photo frame, and a portrait clipped to the photo.
export function IdCard() {
  return (
    <svg viewBox="0 0 116 143" width={116} height={143} fill="#d8d8d8" aria-hidden className="block">
      <path
        fillRule="evenodd"
        d="M5 0h106a5 5 0 0 1 5 5v133a5 5 0 0 1-5 5H5a5 5 0 0 1-5-5V5a5 5 0 0 1 5-5Zm7.5 12.5v118h91v-118Z"
      />
      <path
        fillRule="evenodd"
        d="M22.5 19.5h71a3 3 0 0 1 3 3v98a3 3 0 0 1-3 3h-71a3 3 0 0 1-3-3v-98a3 3 0 0 1 3-3Zm4 7v90h63v-90Z"
      />
      <circle cx="58" cy="64.5" r="18" />
      <path d="M26.5 116.5v-13.04a38 26 0 0 1 63 0v13.04Z" />
    </svg>
  );
}
