import React, { useEffect, useRef, useState } from 'react'

import type { ConsumptionBucket, ConsumptionInterval } from '../api/schema/models'

const HEIGHT = 220
const LABEL_AREA = 28
const VALUE_LABEL_AREA = 16
const BAR_MAX_WIDTH = 24
// px an x-axis label needs to stay legible - month labels (`prosinec 25`) are much wider than `29. 9.`
const MIN_LABEL_SPACING: Record<ConsumptionInterval, number> = { day: 46, week: 46, month: 72, year: 40 }
const MIN_VALUE_LABEL_SPACING = 34 // px per bar below which the per-bar value labels overlap - the tooltip shows the value then

const EDGE_LABEL_ZONE = 36 // px from the chart edge where an x-axis label is anchored to the edge instead of centred

const valueFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 })
const rateFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 })

function formatBucketLabel(bucketStart: string, interval: ConsumptionInterval): string {
	const date = new Date(`${bucketStart}T00:00:00.000Z`)
	if (interval === 'year') return date.getUTCFullYear().toString()
	if (interval === 'month') return date.toLocaleDateString('cs-CZ', { month: 'short', year: '2-digit', timeZone: 'UTC' })
	return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'UTC' })
}

/** `bucketStart`–`bucketEnd` (exclusive) as an inclusive Czech date range, e.g. `1. 9. 2026 – 30. 9. 2026`. */
function formatBucketRange(bucket: ConsumptionBucket): string {
	const format = (date: Date) => date.toLocaleDateString('cs-CZ', { timeZone: 'UTC' })
	const start = new Date(`${bucket.bucketStart}T00:00:00.000Z`)
	const lastDay = new Date(`${bucket.bucketEnd}T00:00:00.000Z`)
	lastDay.setUTCDate(lastDay.getUTCDate() - 1)
	return lastDay.getTime() <= start.getTime() ? format(start) : `${format(start)} – ${format(lastDay)}`
}

/** A bar with rounded top corners, square at the baseline. */
function barPath(x: number, y: number, width: number, height: number, radius: number): string {
	if (height <= 0) return ''
	const r = Math.min(radius, width / 2, height)
	if (r <= 0) return `M${x},${y + height} V${y} H${x + width} V${y + height} Z`
	return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`
}

export const ConsumptionChart: React.FC<{
	buckets: ConsumptionBucket[]
	unit: string
	color: string
	interval: ConsumptionInterval
}> = ({ buckets, unit, color, interval }) => {
	const [hoverIndex, setHoverIndex] = useState<number | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const [width, setWidth] = useState(0)

	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0]
			if (entry) setWidth(entry.contentRect.width)
		})
		observer.observe(el)
		return () => observer.disconnect()
	}, [])

	if (buckets.length === 0) {
		return <p style={{ color: 'var(--text-secondary)' }}>Zatím nejsou žádná data.</p>
	}

	// Skip every Nth x-axis label once buckets get too dense to stay legible.
	const labelStep = width > 0 ? Math.max(1, Math.ceil((MIN_LABEL_SPACING[interval] * buckets.length) / width)) : 1

	const maxConsumption = Math.max(1, ...buckets.map((b) => b.consumption))
	const slotWidth = width / buckets.length
	const barWidth = Math.max(2, Math.min(BAR_MAX_WIDTH, slotWidth * 0.6))
	const plotHeight = HEIGHT - LABEL_AREA - VALUE_LABEL_AREA
	const showValueLabels = slotWidth >= MIN_VALUE_LABEL_SPACING
	const hovered = hoverIndex === null ? undefined : buckets[hoverIndex]

	return (
		<div ref={containerRef} style={{ position: 'relative' }}>
			{width > 0 && (
				<svg width={width} height={HEIGHT} role="img" aria-label={`Graf spotřeby (${unit})`}>
					<line x1={0} y1={VALUE_LABEL_AREA + plotHeight} x2={width} y2={VALUE_LABEL_AREA + plotHeight} stroke="var(--border)" strokeWidth={1} />
					{buckets.map((bucket, i) => {
						const barHeight = maxConsumption > 0 ? (Math.max(0, bucket.consumption) / maxConsumption) * plotHeight : 0
						const cx = slotWidth * i + slotWidth / 2
						const x = cx - barWidth / 2
						const y = VALUE_LABEL_AREA + plotHeight - barHeight
						const isHovered = hoverIndex === i
						return (
							<g
								key={bucket.bucketStart}
								onPointerEnter={() => setHoverIndex(i)}
								onPointerLeave={() => setHoverIndex((current) => (current === i ? null : current))}
								onFocus={() => setHoverIndex(i)}
								onBlur={() => setHoverIndex((current) => (current === i ? null : current))}
								tabIndex={0}
								style={{ cursor: 'pointer' }}
							>
								<rect x={cx - slotWidth / 2} y={0} width={slotWidth} height={HEIGHT} fill="transparent" />
								<path d={barPath(x, y, barWidth, Math.max(barHeight, 1), 4)} fill={color} opacity={isHovered ? 1 : 0.85} />
								{showValueLabels && (
									<text x={cx} y={VALUE_LABEL_AREA - 4} fontSize={11} textAnchor="middle" fill="var(--text-secondary)">
										{valueFormat.format(Math.round(bucket.consumption))}
									</text>
								)}
								{i % labelStep === 0 && (
									// Edge labels are anchored to the chart edge so the SVG doesn't clip them
									<text
										x={cx < EDGE_LABEL_ZONE ? 0 : cx > width - EDGE_LABEL_ZONE ? width : cx}
										y={HEIGHT - 8}
										fontSize={11}
										textAnchor={cx < EDGE_LABEL_ZONE ? 'start' : cx > width - EDGE_LABEL_ZONE ? 'end' : 'middle'}
										fill="var(--text-secondary)"
									>
										{formatBucketLabel(bucket.bucketStart, interval)}
									</text>
								)}
							</g>
						)
					})}
				</svg>
			)}
			{hovered && (
				<div className="ConsumptionTooltip">
					<strong>{valueFormat.format(hovered.consumption)} {unit}</strong>
					{hovered.consumptionLow !== null && (
						<span>NT {valueFormat.format(hovered.consumptionLow)} · VT {valueFormat.format(hovered.consumptionHigh)}</span>
					)}
					<span>{formatBucketRange(hovered)}</span>
					<span>Ø {rateFormat.format(hovered.avgDailyRate)} {unit}/den</span>
				</div>
			)}
		</div>
	)
}
