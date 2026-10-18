import QRCode from 'qrcode'
import React, { useMemo } from 'react'

/** Quiet zone around the code, in modules (the spec asks for 4, banking apps read 2 fine). */
const MARGIN = 2

/** QR code of `value` as a crisp SVG - one path of 1×1 module squares, scaled by the browser. */
export const QrCode: React.FC<{ value: string; size?: number; title?: string }> = ({ value, size = 180, title }) => {
	const { path, dimension } = useMemo(() => {
		const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' })
		let d = ''
		for (let row = 0; row < modules.size; row++) {
			for (let col = 0; col < modules.size; col++) {
				if (modules.get(row, col)) d += `M${col + MARGIN} ${row + MARGIN}h1v1h-1z`
			}
		}
		return { path: d, dimension: modules.size + MARGIN * 2 }
	}, [value])

	return (
		<svg className="QrCode" width={size} height={size} viewBox={`0 0 ${dimension} ${dimension}`} shapeRendering="crispEdges" role="img" aria-label={title}>
			{title && <title>{title}</title>}
			<rect width={dimension} height={dimension} fill="#ffffff" />
			<path d={path} fill="#000000" />
		</svg>
	)
}
