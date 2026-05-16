import { useEffect, useState } from "react";

function formatMoneyFromCents(cents) {
  const value = Number(cents || 0) / 100;

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatDateLabel(value) {
  if (!value) return "—";

  try {
    const date = new Date(value);

    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);
  } catch {
    return value;
  }
}

function formatTooltipLabel(value, bucket) {
  if (!value) return "—";

  try {
    const date = new Date(value);

    if (bucket === "minute" || bucket === "hour") {
      return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }

    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
    }).format(date);
  } catch {
    return value;
  }
}

function formatValue(value, metric) {
  if (metric === "revenueCents" || metric === "profitCents") {
    return formatMoneyFromCents(value);
  }

  if (metric === "conversionRate") {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  return String(value ?? 0);
}

function CustomTooltip({ active, payload, label, metric, bucket }) {
  if (!active || !payload?.length) return null;

  const value = payload[0]?.value ?? 0;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e1e3e5",
        borderRadius: 14,
        padding: 12,
        boxShadow: "0 10px 26px rgba(0,0,0,0.10)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "#6d7175",
          marginBottom: 6,
        }}
      >
        {formatTooltipLabel(label, bucket)}
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#111111",
        }}
      >
        {formatValue(value, metric)}
      </div>
    </div>
  );
}

function getChartColor(metric) {
  if (metric === "orders") return "#2563eb";
  if (metric === "revenueCents") return "#16a34a";
  if (metric === "profitCents") return "#111111";

  return "#22c55e";
}

export default function CampaignPerformanceChart({
  data = [],
  metric = "clicks",
  bucket = "day",
}) {
  const color = getChartColor(metric);
  const [charts, setCharts] = useState(null);

  useEffect(() => {
    let active = true;

    if (typeof window === "undefined") return;

    import("recharts").then((mod) => {
      if (active) setCharts(mod);
    });

    return () => {
      active = false;
    };
  }, []);

  if (!charts) {
    return <div style={{ width: "100%", height: 340 }} />;
  }

  const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } = charts;

  return (
    <div style={{ width: "100%", height: 340 }}>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{
            top: 16,
            right: 18,
            left: 4,
            bottom: 8,
          }}
        >
          <CartesianGrid stroke="#eef0f2" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={(value) => {
              if (bucket === "minute" || bucket === "hour") {
                try {
                  return new Intl.DateTimeFormat("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(value));
                } catch {
                  return value;
                }
              }

              return formatDateLabel(value);
            }}
            tick={{ fontSize: 12, fill: "#6d7175" }}
            axisLine={false}
            tickLine={false}
            minTickGap={20}
          />

          <YAxis
            tick={{ fontSize: 12, fill: "#6d7175" }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(value) => {
              if (metric === "revenueCents" || metric === "profitCents") {
                return `${Math.round(Number(value || 0) / 100)}€`;
              }

              return value;
            }}
          />

          <Tooltip
            content={
              <CustomTooltip
                metric={metric}
                bucket={bucket}
              />
            }
          />

          <Line
            type="monotone"
            dataKey={metric}
            stroke={color}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}