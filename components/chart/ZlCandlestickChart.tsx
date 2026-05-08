"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from "lightweight-charts";
import type { ZlPriceBar, TargetZone } from "@/lib/contracts/api";
import { calculateFibonacciMultiPeriod, type CandleData, type FibResult } from "@/lib/chart/autofib";
import { PivotLinesPrimitive } from "@/lib/chart/PivotLinesPrimitive";
import { ForecastTargetsPrimitive } from "@/lib/chart/ForecastTargetsPrimitive";

const CANDLE_THEME = {
  upColor: "#26C6DA",
  downColor: "#FF0000",
  borderUpColor: "transparent",
  borderDownColor: "transparent",
  wickUpColor: "#FFFFFF",
  wickDownColor: "rgba(178,181,190,0.83)",
};

const GRID_COLOR = "rgba(255,255,255,0.04)";
const CROSSHAIR_COLOR = "rgba(255,255,255,0.55)";
const LABEL_BG = "rgba(20,10,40,0.9)";
const TEXT_COLOR = "rgba(255,255,255,0.4)";

const INITIAL_VISIBLE_BARS = 120;
const RIGHT_PADDING_BARS = 16;
const BAR_SPACING = 10;
const MIN_BAR_SPACING = 8;
const REFRESH_MS = 60 * 60 * 1000;
const SHOW_FORECAST_TARGET_OVERLAY = false;
const SMA_PERIOD = 200;
const SMA_COLOR = "#FFFFFF";
const SMA_WIDTH = 2;

function toChartDay(dateStr: string): Time {
  return dateStr.slice(0, 10) as unknown as Time;
}

function computeVolatility(bars: ZlPriceBar[]): string {
  const recent = bars.slice(-20);
  if (recent.length < 2) return "--";
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push(Math.log(recent[i].close / recent[i - 1].close));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return (Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1) + "%";
}

function computeSmaData(candles: CandlestickData<Time>[], period: number): { time: Time; value: number }[] {
  if (candles.length < period) return [];

  const result: { time: Time; value: number }[] = [];
  let rollingSum = 0;

  for (let i = 0; i < candles.length; i += 1) {
    rollingSum += candles[i].close;
    if (i >= period) {
      rollingSum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      result.push({
        time: candles[i].time,
        value: rollingSum / period,
      });
    }
  }

  return result;
}

export function ZlCandlestickChart({
  height = "70vh",
  targetZones = [],
}: {
  height?: string | number;
  targetZones?: TargetZone[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fitCalledRef = useRef(false);
  const fibLockedRef = useRef<FibResult | null>(null);

  const [bars, setBars] = useState<ZlPriceBar[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState(0);
  const [highPrice, setHighPrice] = useState<number | null>(null);
  const [lowPrice, setLowPrice] = useState<number | null>(null);
  const [volatility, setVolatility] = useState("--");

  // Fetch daily bars
  useEffect(() => {
    async function fetchBars() {
      try {
        const res = await fetch("/api/zl/price-1d", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!json.data || json.data.length === 0) return;

        const parsed: ZlPriceBar[] = json.data.map(
          (d: Record<string, unknown>) => ({
            symbol: String(d.symbol),
            tradeDate: String(d.tradeDate),
            open: Number(d.open),
            high: Number(d.high),
            low: Number(d.low),
            close: Number(d.close),
            volume: Number(d.volume),
          }),
        );

        setBars(parsed);

        const latest = parsed[parsed.length - 1];
        const prev = parsed[parsed.length - 2];
        setLastPrice(latest.close);
        setHighPrice(latest.high);
        setLowPrice(latest.low);
        setVolatility(computeVolatility(parsed));

        if (prev) {
          setPriceChange(((latest.close - prev.close) / prev.close) * 100);
        }
      } catch {
        /* fail silently — chart stays empty */
      }
    }

    fetchBars();
    const id = setInterval(fetchBars, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Create and manage chart
  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    // Clean up previous
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch {
        /* already disposed */
      }
      chartRef.current = null;
      seriesRef.current = null;
      fitCalledRef.current = false;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: TEXT_COLOR,
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: {
        vertLine: {
          color: CROSSHAIR_COLOR,
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: LABEL_BG,
        },
        horzLine: {
          color: CROSSHAIR_COLOR,
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: LABEL_BG,
        },
      },
      rightPriceScale: {
        borderColor: "transparent",
        autoScale: true,
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "transparent",
        timeVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
        rightOffset: RIGHT_PADDING_BARS,
        barSpacing: BAR_SPACING,
        minBarSpacing: MIN_BAR_SPACING,
        lockVisibleTimeRangeOnResize: true,
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
    });

    chartRef.current = chart;

    // Build candlestick data sorted chronologically
    const candleData: CandlestickData<Time>[] = bars
      .map((b) => ({
        time: toChartDay(b.tradeDate),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));

    const series = chart.addSeries(CandlestickSeries, {
      upColor: CANDLE_THEME.upColor,
      downColor: CANDLE_THEME.downColor,
      borderUpColor: CANDLE_THEME.borderUpColor,
      borderDownColor: CANDLE_THEME.borderDownColor,
      wickUpColor: CANDLE_THEME.wickUpColor,
      wickDownColor: CANDLE_THEME.wickDownColor,
      priceLineVisible: true,
    });

    series.setData(candleData);
    seriesRef.current = series;

    const smaData = computeSmaData(candleData, SMA_PERIOD);
    if (smaData.length > 0) {
      const smaSeries = chart.addSeries(LineSeries, {
        color: SMA_COLOR,
        lineWidth: SMA_WIDTH,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      smaSeries.setData(smaData);
    }

    const pivotPrimitive = new PivotLinesPrimitive();
    const forecastTargetsPrimitive = new ForecastTargetsPrimitive();
    series.attachPrimitive(pivotPrimitive);
    if (SHOW_FORECAST_TARGET_OVERLAY) {
      series.attachPrimitive(forecastTargetsPrimitive);
    }

    // Forecast target zones should be projected near the most recent bars, not full-width.
    if (SHOW_FORECAST_TARGET_OVERLAY) {
      const targetStartIndex = Math.max(0, candleData.length - 16);
      const targetStartTime = candleData[targetStartIndex]?.time;
      forecastTargetsPrimitive.setTargetZones(targetZones, targetStartTime);
    }

    // Fib rendering: anchored start, pivot zone fill, and structural-break lock.
    const fibCandles: CandleData[] = bars.map((b, idx) => ({
      time: idx,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    const currentPrice = bars[bars.length - 1]?.close;
    let fibResult = fibLockedRef.current;
    if (
      !fibResult ||
      currentPrice == null ||
      currentPrice > fibResult.anchorHigh ||
      currentPrice < fibResult.anchorLow
    ) {
      fibResult = calculateFibonacciMultiPeriod(fibCandles);
      fibLockedRef.current = fibResult;
    }

    if (fibResult) {
      const anchorIdx = Math.min(
        fibResult.anchorHighBarIndex,
        fibResult.anchorLowBarIndex,
      );
      const anchorStartTime = candleData[anchorIdx]?.time;
      pivotPrimitive.setFibResult(fibResult, anchorStartTime);
    } else {
      pivotPrimitive.setFibResult(null);
    }

    // Set initial visible range: last N bars + right padding
    if (!fitCalledRef.current && candleData.length > 0) {
      const total = candleData.length;
      const visible = Math.min(INITIAL_VISIBLE_BARS, total);
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, total - visible),
        to: total - 1 + RIGHT_PADDING_BARS,
      });
      fitCalledRef.current = true;
    }

    // Responsive resize
    let disposed = false;
    const observer = new ResizeObserver((entries) => {
      if (disposed || !entries[0]) return;
      const { width, height: h } = entries[0].contentRect;
      try {
        chart.applyOptions({ width, height: h });
      } catch {
        /* disposed */
      }
    });
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      observer.disconnect();
      try {
        if (SHOW_FORECAST_TARGET_OVERLAY) {
          series.detachPrimitive(forecastTargetsPrimitive);
        }
        series.detachPrimitive(pivotPrimitive);
        chart.remove();
      } catch {
        /* disposed */
      }
    };
  }, [bars, targetZones]);

  const changeColor = priceChange >= 0 ? "#26C6DA" : "#EC0000";

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-white/5 flex flex-col"
      style={{
        background: "linear-gradient(180deg, #131722 0%, #0d1117 100%)",
        height: typeof height === "number" ? `${height}px` : height,
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" />
            <span className="text-sm font-semibold text-white tracking-tight">
              ZL1!
            </span>
          </div>
          <span className="text-[11px] text-white/30 font-medium">
            Soybean Oil &bull; 1D
          </span>
        </div>
        <div className="flex items-center gap-4">
          {highPrice != null && lowPrice != null && (
            <div className="flex items-center gap-3 text-[11px]">
              <div className="flex items-center gap-1">
                <span className="text-white/30">H</span>
                <span className="text-white/60 font-mono">
                  {highPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-white/30">L</span>
                <span className="text-white/60 font-mono">
                  {lowPrice.toFixed(2)}
                </span>
              </div>
            </div>
          )}
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5">
            <span className="text-[9px] text-white/30 uppercase">IV</span>
            <span className="text-[11px] font-mono text-cyan-400">
              {volatility}
            </span>
          </div>
          {lastPrice != null && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-white tabular-nums">
                {lastPrice.toFixed(2)}
              </span>
              <span
                className="text-xs font-medium tabular-nums"
                style={{ color: changeColor }}
              >
                {priceChange >= 0 ? "+" : ""}
                {priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="relative w-full flex-1 min-h-0">
        {/* Watermark overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
          <Image
            src="/chart_watermark.svg"
            alt=""
            width={280}
            height={140}
            className="opacity-[0.10]"
            style={{ filter: "grayscale(100%)" }}
            priority
          />
        </div>
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
      </div>

      {/* Legend */}
      <div className="flex-shrink-0 flex items-center justify-center gap-6 px-4 py-1.5 border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5" style={{ backgroundColor: SMA_COLOR }} />
          <span className="text-[9px] text-white/40 uppercase">200 SMA</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-3 rounded-sm"
            style={{ backgroundColor: "#26C6DA" }}
          />
          <span className="text-[9px] text-white/40 uppercase">Bull</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-3 rounded-sm"
            style={{ backgroundColor: "#EC0000" }}
          />
          <span className="text-[9px] text-white/40 uppercase">Bear</span>
        </div>
      </div>
    </div>
  );
}
