interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export default function Toggle({ checked, onChange, disabled, size = "md" }: ToggleProps) {
  const sizes = {
    sm: { track: "h-5 w-9", thumb: "h-3.5 w-3.5", on: "translate-x-[18px]", off: "translate-x-[2px]" },
    md: { track: "h-6 w-11", thumb: "h-4.5 w-4.5", on: "translate-x-[22px]", off: "translate-x-[2px]" },
  }[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${sizes.track} items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${checked ? "bg-primary-500" : "bg-slate-300"}`}
    >
      <span
        className={`inline-block ${sizes.thumb} rounded-full bg-surface shadow-sm transition-transform duration-200 ${
          checked ? sizes.on : sizes.off
        }`}
      />
    </button>
  );
}
