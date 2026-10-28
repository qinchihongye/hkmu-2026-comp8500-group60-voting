import { Modal } from "antd";

import { useI18n } from "../i18n/LocaleProvider";

export function ConfirmVoteModal({
  open,
  optionLabels,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  optionLabels: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      title={t("ballot.confirmTitle")}
      okText={t("ballot.confirmOk")}
      cancelText={t("ballot.confirmCancel")}
      confirmLoading={busy}
      onCancel={onCancel}
      onOk={onConfirm}
      okButtonProps={{ "data-testid": "vote-confirm", disabled: busy }}
      cancelButtonProps={{ disabled: busy }}
      destroyOnHidden
    >
      <p>{t("ballot.confirmBody")}</p>
      <ul aria-label={t("ballot.selected")}>
        {optionLabels.map((label, index) => (
          <li key={`${index}-${label}`}>{label}</li>
        ))}
      </ul>
    </Modal>
  );
}
