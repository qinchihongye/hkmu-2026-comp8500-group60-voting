import { Modal } from "antd";

import { useI18n } from "../i18n/LocaleProvider";

export function ConfirmVoteModal({
  open,
  optionLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  optionLabel: string;
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
      destroyOnHidden
    >
      <p>{t("ballot.confirmBody", { option: optionLabel })}</p>
    </Modal>
  );
}
