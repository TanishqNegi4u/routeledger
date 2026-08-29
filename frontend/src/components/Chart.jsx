import { useEffect, useRef, useState } from 'react';

/**
 * Chart.js wrapper.
 *
 * Chart.js arrives from the CDN tag in index.html with `defer`, so it may not exist yet on first
 * paint. This waits for `window.Chart`, draws once it is there, and rebuilds the chart whenever the
 * data or type changes. The canvas is destroyed on unmount so navigating away cannot leak it.
 */
export default function Chart({ type, data, options, height = 260, ariaLabel }) {
  const canvas = useRef(null);
  const chart = useRef(null);
  const [ready, setReady] = useState(() => typeof window !== 'undefined' && Boolean(window.Chart));

  useEffect(() => {
    if (ready) return undefined;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (window.Chart) {
        setReady(true);
        window.clearInterval(timer);
      } else if (attempts > 60) {
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    if (!ready || !canvas.current) return undefined;
    const ChartJs = window.Chart;
    chart.current = new ChartJs(canvas.current, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 420 },
        ...options,
      },
    });
    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
  }, [ready, type, data, options]);

  return (
    <div style={{ position: 'relative', height }}>
      {!ready ? (
        <div className="center" style={{ height: '100%' }}>
          <span className="hint">Loading chart library…</span>
        </div>
      ) : null}
      <canvas ref={canvas} role="img" aria-label={ariaLabel} />
    </div>
  );
}

/** Shared axis/tooltip styling so every chart in the app reads the same way. */
export function baseOptions({ valueFormatter, tooltipFormatter, yAxisFormatter, yTitle } = {}) {
  const formatTooltip = tooltipFormatter || valueFormatter;
  const formatYAxis = yAxisFormatter || valueFormatter;
  return {
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 16 },
      },
      tooltip: {
        backgroundColor: '#0b1020',
        padding: 10,
        cornerRadius: 8,
        titleFont: { size: 12, weight: '600' },
        bodyFont: { size: 12 },
        callbacks: formatTooltip
          ? {
              label: (context) =>
                ` ${context.dataset.label}: ${formatTooltip(context.parsed.y ?? context.parsed)}`,
            }
          : undefined,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 11 }, maxRotation: 0, autoSkipPadding: 14 },
        border: { color: '#e2e8f0' },
      },
      y: {
        beginAtZero: true,
        title: yTitle ? { display: true, text: yTitle, color: '#94a3b8', font: { size: 11 } } : undefined,
        grid: { color: '#f1f5f9' },
        ticks: {
          color: '#64748b',
          font: { size: 11 },
          callback: (value) => (formatYAxis ? formatYAxis(value) : value),
        },
        border: { display: false },
      },
    },
  };
}
