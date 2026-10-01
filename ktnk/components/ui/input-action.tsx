import type { ComponentPropsWithoutRef } from "react";

export function InputAction({ actionLabel, onAction, actionDisabled = false, ...inputProps }: ComponentPropsWithoutRef<"input"> & {
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
}) {
  return <div className="input-action">
    <input {...inputProps} className="input" />
    <button type="button" className="input-action-button" disabled={inputProps.disabled || actionDisabled} onClick={onAction}>{actionLabel}</button>
  </div>;
}
