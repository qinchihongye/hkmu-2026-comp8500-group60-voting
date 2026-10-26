import { useI18n } from "../../i18n/LocaleProvider";

export function PollFilters({
  q,
  status,
  statuses,
  onChange,
}: {
  q: string;
  status: string;
  statuses: { value: string; label: string }[];
  onChange: (next: { q: string; status: string }) => void;
}) {
  const { t } = useI18n();
  return (
    <form
      className="inline-actions"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onChange({ q: String(data.get("q") ?? ""), status: String(data.get("status") ?? "") });
      }}
    >
      <label>
        {t("common.searchTitle")}
        <input name="q" defaultValue={q} maxLength={120} />
      </label>
      <label>
        {t("common.status")}
        <select name="status" defaultValue={status}>
          {statuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">{t("common.filter")}</button>
    </form>
  );
}
