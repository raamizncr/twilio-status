import { useMemo, useState } from "react";
import { buildRawRows, type RawVariant } from "./rawDisplay";

type Props = {
  variant: RawVariant;
  data: Record<string, unknown>;
  /** Shown above the field grid */
  summary?: string;
};

export function RawDataPanel({ variant, data, summary }: Props) {
  const rows = useMemo(() => buildRawRows(data, variant), [data, variant]);
  const [jsonOpen, setJsonOpen] = useState(false);
  const jsonText = useMemo(() => JSON.stringify(data, null, 2), [data]);

  return (
    <div className="raw-data-panel">
      {summary && <p className="raw-panel-summary">{summary}</p>}
      <dl className="raw-field-grid">
        {rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className="raw-field-row">
            <dt>{row.label}</dt>
            <dd title={row.value.length > 120 ? row.value : undefined}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="json-toggle">
        <button
          type="button"
          className="btn btn-json"
          onClick={() => setJsonOpen((o) => !o)}
          aria-expanded={jsonOpen}
        >
          {jsonOpen ? "▼" : "▶"} Raw JSON
        </button>
        {jsonOpen && <pre className="raw">{jsonText}</pre>}
      </div>
    </div>
  );
}
