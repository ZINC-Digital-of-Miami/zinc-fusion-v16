import type {
  AutoscaleInfo,
  Coordinate,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

import type { TargetZone } from "@/lib/contracts/api";

type TargetLine = {
  price: number;
  color: string;
  lineWidth: number;
  lineDash: number[];
};

type TargetBand = {
  topPrice: number;
  bottomPrice: number;
  color: string;
  opacity: number;
};

const TARGET_COLORS = {
  p30: "#EF4444",
  p50: "#EF7300",
  p70: "#FFFFFF",
  band: "#26C6DA",
} as const;

class ForecastTargetsRenderer implements IPrimitivePaneRenderer {
  private _lines: TargetLine[] = [];
  private _bands: TargetBand[] = [];
  private _priceToY: ((price: number) => Coordinate | null) | null = null;
  private _startX: number | null = null;

  update(
    lines: TargetLine[],
    bands: TargetBand[],
    priceToY: (price: number) => Coordinate | null,
    startX: number | null,
  ) {
    this._lines = lines;
    this._bands = bands;
    this._priceToY = priceToY;
    this._startX = startX;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (!this._priceToY) return;

      const x0 = this._startX != null ? Math.max(0, this._startX) : 0;
      if (x0 >= mediaSize.width) return;

      for (const band of this._bands) {
        const topY = this._priceToY(band.topPrice);
        const bottomY = this._priceToY(band.bottomPrice);
        if (topY == null || bottomY == null) continue;

        const y0 = Math.min(topY, bottomY);
        const h = Math.abs(bottomY - topY);
        if (h <= 0) continue;

        ctx.fillStyle = hexToRgba(band.color, band.opacity);
        ctx.fillRect(x0, y0, mediaSize.width - x0, h);
      }

      for (const line of this._lines) {
        const y = this._priceToY(line.price);
        if (y == null) continue;
        if (y < -30 || y > mediaSize.height + 30) continue;

        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.lineWidth;
        ctx.setLineDash(line.lineDash);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(mediaSize.width, y);
        ctx.stroke();
      }
    });
  }
}

class ForecastTargetsPaneView implements IPrimitivePaneView {
  private _renderer = new ForecastTargetsRenderer();

  update(
    lines: TargetLine[],
    bands: TargetBand[],
    priceToY: (price: number) => Coordinate | null,
    startX: number | null,
  ) {
    this._renderer.update(lines, bands, priceToY, startX);
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

export class ForecastTargetsPrimitive implements ISeriesPrimitive<Time> {
  private _targetZones: TargetZone[] = [];
  private _startTime: Time | null = null;
  private _paneView = new ForecastTargetsPaneView();
  private _attachedParams: SeriesAttachedParameter<Time, SeriesType> | null = null;

  setTargetZones(targetZones: TargetZone[], startTime?: Time) {
    this._targetZones = targetZones;
    this._startTime = startTime ?? null;
    if (this._attachedParams) {
      this._attachedParams.requestUpdate();
    }
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this._attachedParams = param;
  }

  detached() {
    this._attachedParams = null;
  }

  updateAllViews() {
    if (!this._attachedParams || this._targetZones.length === 0) {
      this._paneView.update([], [], () => null, null);
      return;
    }

    const { series, chart } = this._attachedParams;
    const priceToY = (price: number) => series.priceToCoordinate(price);
    const timeScale = chart.timeScale();

    let startX: number | null = null;
    if (this._startTime != null) {
      const x = timeScale.timeToCoordinate(this._startTime);
      startX = x != null ? x : 0;
    }

    const zones = this._targetZones
      .slice()
      .sort((a, b) => a.horizonDays - b.horizonDays);

    const bands: TargetBand[] = zones.map((zone, idx) => ({
      topPrice: Math.max(zone.p70, zone.p30),
      bottomPrice: Math.min(zone.p70, zone.p30),
      color: TARGET_COLORS.band,
      opacity: Math.max(0.02, 0.05 - idx * 0.01),
    }));

    const lines: TargetLine[] = [];
    for (const zone of zones) {
      lines.push({
        price: zone.p30,
        color: TARGET_COLORS.p30,
        lineWidth: 1,
        lineDash: [4, 4],
      });
      lines.push({
        price: zone.p50,
        color: TARGET_COLORS.p50,
        lineWidth: 1.5,
        lineDash: [],
      });
      lines.push({
        price: zone.p70,
        color: TARGET_COLORS.p70,
        lineWidth: 1,
        lineDash: [],
      });
    }

    this._paneView.update(lines, bands, priceToY, startX);
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  autoscaleInfo(): AutoscaleInfo | null {
    return null;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
