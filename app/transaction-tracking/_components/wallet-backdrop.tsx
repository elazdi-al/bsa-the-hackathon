import { walletRows } from "../data";

/** A blurred, dimmed impression of the wallet the sheet was opened from. */
export function WalletBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 bg-white">
      <div className="scale-110 px-5 pt-[calc(env(safe-area-inset-top)_+_28px)] blur-[14px]">
        <div className="flex items-center gap-3">
          <span className="size-9 rounded-xl bg-[#d9d9de]" />
          <span className="h-4 w-24 rounded-full bg-[#c9c9cf]" />
        </div>
        <div className="mt-8 h-3 w-20 rounded-full bg-[#d4d4d8]" />
        <div className="mt-3 h-8 w-44 rounded-lg bg-[#8f8f96]" />
        <ul className="mt-10 space-y-7">
          {walletRows.map((row, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="size-11 rounded-full" style={{ background: row.coin }} />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 rounded-full bg-[#9b9ba1]" style={{ width: row.name }} />
                <span className="block h-3 rounded-full bg-[#cfcfd4]" style={{ width: row.amount }} />
              </span>
              <span className="flex flex-col items-end space-y-2">
                <span className="block h-3.5 w-20 rounded-full bg-[#9b9ba1]" />
                {row.change && (
                  <span className={`block h-3 w-12 rounded-full ${row.change === "up" ? "bg-[#7fdc9a]" : "bg-[#f19a9a]"}`} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
}
