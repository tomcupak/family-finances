import React from 'react'

import { addMonths, currentMonth } from '../utils/expenses'

/** ‹ month › switcher (`YYYY-MM`) with a jump back to the current month. */
export const MonthSwitcher: React.FC<{ month: string; onChange: (month: string) => void }> = ({ month, onChange }) => (
	<div className="MonthSwitcher">
		<button type="button" className="SecondaryButton" aria-label="Předchozí měsíc" onClick={() => onChange(addMonths(month, -1))}>‹</button>
		<input
			type="month"
			aria-label="Měsíc"
			value={month}
			onChange={(e) => { if (e.target.value) onChange(e.target.value) }}
		/>
		<button type="button" className="SecondaryButton" aria-label="Další měsíc" onClick={() => onChange(addMonths(month, 1))}>›</button>
		{month !== currentMonth() && (
			<button type="button" className="SecondaryButton" onClick={() => onChange(currentMonth())}>Aktuální měsíc</button>
		)}
	</div>
)
