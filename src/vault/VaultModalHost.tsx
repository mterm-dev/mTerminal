import { useCallback } from "react";
import { MasterPasswordModal } from "../components/MasterPasswordModal";
import { useVaultGate } from "./VaultGate";

export function VaultModalHost() {
  const gate = useVaultGate();
  const onClose = useCallback(() => gate.closeModal(), [gate]);

  if (!gate.modal) return null;

  return (
    <MasterPasswordModal
      mode={gate.modal.mode}
      phase={gate.modal.phase}
      onPhaseChange={(p) => gate.setModalPhase(p)}
      onClose={onClose}
      onInit={(pw) => gate.init(pw)}
      onUnlock={(pw) => gate.unlock(pw)}
      onChange={(oldPw, newPw) => gate.changePassword(oldPw, newPw)}
    />
  );
}
