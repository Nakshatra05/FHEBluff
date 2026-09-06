export function DealerHost(){
  return <div className="mb-2 flex items-center justify-center gap-2 text-white">
    <svg aria-hidden="true" viewBox="0 0 64 64" className="size-10 border-2 border-ink bg-pink shadow-hard-sm">
      <path d="M12 54V28C12 2 52 2 52 28V54" fill="#151513"/>
      <path d="M19 25Q32 23 40 14L46 28V36C46 54 18 54 18 36Z" fill="#f2b98c" stroke="#151513" strokeWidth="2"/>
      <path d="M10 64Q12 46 26 46L32 53L38 46Q52 46 54 64" fill="#fff9df" stroke="#151513" strokeWidth="2"/>
      <path d="M26 53L32 56L38 53V61L32 58L26 61Z" fill="#6744ef"/>
      <path d="M24 31h4m8 0h4m-12 9q4 3 8 0" fill="none" stroke="#151513" strokeWidth="2"/>
    </svg><span className="text-xs font-black">ACE · TABLE HOST<span className="block font-normal text-white/75">Style only. The contract deals.</span></span>
  </div>;
}
