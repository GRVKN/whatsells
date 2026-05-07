import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

function formatMoneyFromCents(cents) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format((Number(cents || 0)) / 100);
}

function formatXAxisDate(value) {
  try {
    const d = new Date(value);
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
    }).format(d);
  } catch {
    return value;
  }
}

function CustomTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;

  const value = payload[0].value;

  let formattedValue = value;
  if (metric === "revenueCents" || metric === "profitCents") {
    formattedValue = formatMoneyFromCents(value);
  } else if (metric === "conversionRate") {
    formattedValue = `${Number(value).toFixed(1)}%`;
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e1e3e5",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontSize: 12, color: "#6d7175", marginBottom: 6 }}>
        {formatXAxisDate(label)}
      </div>
      <div style={{ fontWeight: 600 }}>{formattedValue}</div>
    </div>
  );
}

export default function CampaignPerformanceChart({
  data = [],
  metric = "clicks",
  color = "#22c55e",
}) {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid stroke="#f1f2f4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxisDate}
            tick={{ fontSize: 12, fill: "#6d7175" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#6d7175" }}
            axisLine={false}
            tickLine={false}
            width={60}
            tickFormatter={(value) => {
              if (metric === "revenueCents" || metric === "profitCents") {
                return `${Math.round(value / 100)}€`;
              }
              return value;
            }}
          />
          <Tooltip content={<CustomTooltip metric={metric} />} />
          <Line
            type="monotone"
            dataKey={metric}
            stroke={color}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}