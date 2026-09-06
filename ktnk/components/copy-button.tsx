"use client";

export function CopyButton({
  label,
  copied = false,
  disabled,
  onCopy,
}: {
  label: string;
  copied?: boolean;
  disabled?: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-secondary min-h-11 w-full px-2 text-sm sm:w-auto sm:px-3"
      disabled={disabled}
      aria-label={label}
      onClick={onCopy}
    >
      {copied ? "コピー済み" : "前回をコピー"}
    </button>
  );
}
