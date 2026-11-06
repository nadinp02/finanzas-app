"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { formatMoney, formatMoneyCompact, parseDecimal } from "@/lib/money";

interface Point {
  day: number;
  current: number | null;
  previous: number | null;
}

interface ExpenseChartProps {
  data: { day: number; current: string | null; previous: string | null }[];
  currentLabel: string;
  previousLabel: string;
}

const toPesos = (value: string | null) => (value === null ? null : Number(parseDecimal(value)) / 100);
const toCents = (pesos: number) => BigInt(Math.round(pesos * 100));

const CURRENT_COLOR = "var(--chart-1)";
const PREVIOUS_COLOR = "var(--chart-3)";

function ChartTooltip({ active, payload, label, currentLabel, previousLabel }: TooltipContentProps<number, string> & { currentLabel: string; previousLabel: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload as Point;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-[13px] shadow-md">
      <p className="mb-1 font-semibold">Día {label}</p>
      {point.current !== null && (
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
          <span className="text-muted-foreground">{currentLabel}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{formatMoney(toCents(point.current))}</span>
        </p>
      )}
      {point.previous !== null && (
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-3 rounded-full border-t-2 border-dashed" style={{ borderColor: PREVIOUS_COLOR }} />
          <span className="text-muted-foreground">{previousLabel}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{formatMoney(toCents(point.previous))}</span>
        </p>
      )}
    </div>
  );
}

/** Gasto acumulado del mes contra el mes anterior, día por día. */
export function ExpenseChart({ data, currentLabel, previousLabel }: ExpenseChartProps) {
  const points: Point[] = data.map((d) => ({ day: d.day, current: toPesos(d.current), previous: toPesos(d.previous) }));
  const hasPrevious = points.some((p) => p.previous !== null && p.previous > 0);
  const lastDay = points.length;

  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
          {currentLabel}
        </span>
        {hasPrevious && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-4 border-t-2 border-dashed" style={{ borderColor: PREVIOUS_COLOR }} />
            {previousLabel}
          </span>
        )}
      </figcaption>
      <div className="h-48" role="img" aria-label={`Gasto acumulado por día: ${currentLabel}${hasPrevious ? ` comparado con ${previousLabel}` : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="day"
              type="number"
              domain={[1, lastDay]}
              ticks={[1, 8, 15, 22, lastDay]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              width={72}
              tickLine={false}
              axisLine={false}
              tickCount={4}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(value: number) => formatMoneyCompact(toCents(value))}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} currentLabel={currentLabel} previousLabel={previousLabel} />}
            />
            {hasPrevious && (
              <Line
                dataKey="previous"
                type="monotone"
                stroke={PREVIOUS_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            <Line
              dataKey="current"
              type="monotone"
              stroke={CURRENT_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
