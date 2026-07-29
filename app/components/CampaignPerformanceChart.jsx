import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_CURRENCY,
  formatCompactMoneyFromCents,
  formatMoneyFromCents,
} from "../money";
import { useI18n } from "../i18n-context";

const CHART_HEIGHT = 320;
const WRAPPER_HEIGHT = 340;
const MIN_CHART_WIDTH = 320;

function formatDateLabel(value, intlLocale) {
  if (!value) return "—";

  try {
    const date = new Date(value);

    return new Intl.DateTimeFormat(intlLocale, {
      day: "2-digit",
      month: "2-digit",
    }).format(date);
  } catch {
    return String(value);
  }
}

function formatTooltipLabel(value, bucket, intlLocale) {
  if (!value) return "—";

  try {
    const date = new Date(value);

    if (bucket === "minute" || bucket === "hour") {
      return new Intl.DateTimeFormat(intlLocale, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }

    return new Intl.DateTimeFormat(intlLocale, {
      dateStyle: "medium",
    }).format(date);
  } catch {
    return String(value);
  }
}

function formatValue(value, metric, currency, intlLocale) {
  const num = Number(value || 0);

  if (metric === "revenueCents" || metric === "profitCents") {
    return formatMoneyFromCents(num, currency, { locale: intlLocale });
  }

  if (metric === "conversionRate") {
    return `${num.toFixed(1)}%`;
  }

  if (metric === "roas") {
    return `${num.toFixed(2)}x`;
  }

  return String(value ?? 0);
}

function formatYAxisValue(value, metric, currency, intlLocale) {
  const num = Number(value || 0);

  if (metric === "revenueCents" || metric === "profitCents") {
    return formatCompactMoneyFromCents(num, currency, { locale: intlLocale });
  }

  if (metric === "conversionRate") {
    return `${num}%`;
  }

  if (metric === "roas") {
    return `${num}x`;
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

function CustomTooltip({
  active,
  payload,
  label,
  metric,
  bucket,
  currency,
  intlLocale,
}) {
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
        {formatTooltipLabel(label, bucket, intlLocale)}
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#111111",
        }}
      >
        {formatValue(value, metric, currency, intlLocale)}
      </div>
    </div>
  );
}

export default function CampaignPerformanceChart({
  data = [],
  metric = "clicks",
  bucket = "day",
  currency = DEFAULT_CURRENCY,
}) {
  const wrapperRef = useRef(null);
  const { t, intlLocale } = useI18n();

  const [charts, setCharts] = useState(null);
  const [chartError, setChartError] = useState("");
  const [chartWidth, setChartWidth] = useState(0);

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const element = wrapperRef.current;
    if (!element) return undefined;

    function updateWidth() {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.floor(rect.width);

      if (nextWidth > 0) {
        setChartWidth(Math.max(nextWidth, MIN_CHART_WIDTH));
      }
    }

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });

    resizeObserver.observe(element);

    const timeoutId = window.setTimeout(updateWidth, 150);

    return () => {
      window.clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, []);

  if (chartError) {
    return (
      <div
        ref={wrapperRef}
        style={{
          width: "100%",
          minWidth: 0,
          height: WRAPPER_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6d7175",
        }}
      >
        {t(chartError)}
      </div>
    );
  }

  if (!safeData.length) {
    return (
      <div
        ref={wrapperRef}
        style={{
          width: "100%",
          minWidth: 0,
          height: WRAPPER_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6d7175",
        }}
      >
        {t("No data available")}
      </div>
    );
  }

  if (!charts || chartWidth <= 0) {
    return (
      <div
        ref={wrapperRef}
        style={{
          width: "100%",
          minWidth: 0,
          height: WRAPPER_HEIGHT,
        }}
      />
    );
  }

  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } = charts;

  return (
    <div
      ref={wrapperRef}
      style={{
        width: "100%",
        minWidth: 0,
        height: WRAPPER_HEIGHT,
        overflow: "hidden",
      }}
    >
      <LineChart
        width={chartWidth}
        height={CHART_HEIGHT}
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
                return new Intl.DateTimeFormat(intlLocale, {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(value));
              } catch {
                return String(value);
              }
            }

            return formatDateLabel(value, intlLocale);
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
          tickFormatter={(value) =>
            formatYAxisValue(value, metric, currency, intlLocale)
          }
        />

        <Tooltip
          content={
            <CustomTooltip
              metric={metric}
              bucket={bucket}
              currency={currency}
              intlLocale={intlLocale}
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
    </div>
  );
}
