import { walletRows } from "../data";

/** A blurred impression of the History list the sheet was opened from. */
export function WalletBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 bg-white">
      <div className="mx-auto max-w-md scale-110 px-5 pt-[calc(env(safe-area-inset-top)_+_28px)] blur-[14px]">
        <span className="block h-4 w-20 rounded-full bg-[#8f8f96]" />
        <span className="mt-3 block h-3 w-44 rounded-full bg-[#d4d4d8]" />
        <span className="mt-8 block h-3 w-16 rounded-full bg-[#d4d4d8]" />
        <ul className="mt-4 space-y-6">
          {walletRows.map((row, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="size-10 rounded-full" style={{ background: row.coin }} />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 rounded-full bg-[#9b9ba1]" style={{ width: row.name }} />
                <span className="block h-3 rounded-full bg-[#cfcfd4]" style={{ width: row.amount }} />
              </span>
              <span className="flex flex-col items-end space-y-2">
                <span className={`block h-3.5 w-16 rounded-full ${row.change === "up" ? "bg-positive/60" : "bg-[#9b9ba1]"}`} />
                <span className="block h-3 w-12 rounded-full bg-[#cfcfd4]" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
