import { useEffect, useMemo, useState } from "react";

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
    return String(value);
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
    return String(value);
  }
}

function formatValue(value, metric) {
  const num = Number(value || 0);

  if (metric === "revenueCents" || metric === "profitCents") {
    return formatMoneyFromCents(num);
  }

  if (metric === "conversionRate") {
    return `${num.toFixed(1)}%`;
  }

  return String(value ?? 0);
}

function formatYAxisValue(value, metric) {
  const num = Number(value || 0);

  if (metric === "revenueCents" || metric === "profitCents") {
    return `${Math.round(num / 100)}€`;
  }

  if (metric === "conversionRate") {
    return `${num}%`;
  }

  return String(value ?? 0);
}

function getChartColor(metric) {
  if (metric === "orders") return "#2563eb";
  if (metric === "revenueCents") return "#16a34a";
  if (metric === "profitCents") return "#111111";
  if (metric === "conversionRate") return "#7c3aed";
  if (metric === "roas") return "#ea580c";

  return "#22c55e";
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

export default function CampaignPerformanceChart({
  data = [],
  metric = "clicks",
  bucket = "day",
}) {
  const [charts, setCharts] = useState(null);
  const [chartError, setChartError] = useState("");

  const color = useMemo(() => getChartColor(metric), [metric]);

  const safeData = useMemo(() => {
    if (!Array.isArray(data)) return [];

    return data.map((item) => ({
      ...item,
      [metric]: Number(item?.[metric] || 0),
    }));
  }, [data, metric]);

  useEffect(() => {
    let active = true;

    if (typeof window === "undefined") return undefined;

    import("recharts")
      .then((mod) => {
        if (active) {
          setCharts(mod);
          setChartError("");
        }
      })
      .catch((error) => {
        console.error("Could not load recharts:", error);

        if (active) {
          setChartError("Chart could not be loaded.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (chartError) {
    return (
      <div
        style={{
          width: "100%",
          minWidth: 0,
          height: 340,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6d7175",
        }}
      >
        {chartError}
      </div>
    );
  }

  if (!safeData.length) {
    return (
      <div
        style={{
          width: "100%",
          minWidth: 0,
          height: 340,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6d7175",
        }}
      >
        No data available
      </div>
    );
  }

  if (!charts) {
    return (
      <div
        style={{
          width: "100%",
          minWidth: 0,
          height: 340,
        }}
      />
    );
  }

  const {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
  } = charts;

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        height: 340,
      }}
    >
      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={safeData}
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
                  return String(value);
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
            tickFormatter={(value) => formatYAxisValue(value, metric)}
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
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}