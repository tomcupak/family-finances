import React, { useEffect, useState } from 'react'

/**
 * Visually locks the app as soon as the window loses focus or gets hidden (switching apps / tabs, screen
 * sharing another window) so sensitive numbers aren't shown by accident - an opaque curtain stays until
 * the user clicks „Odemknout". Not a security boundary: the data stays loaded underneath.
 */
export const PrivacyCurtain: React.FC = () => {
	const [locked, setLocked] = useState(() => document.visibilityState === 'hidden')

	useEffect(() => {
		const lock = () => setLocked(true)
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') lock()
		}
		window.addEventListener('blur', lock)
		document.addEventListener('visibilitychange', onVisibilityChange)
		return () => {
			window.removeEventListener('blur', lock)
			document.removeEventListener('visibilitychange', onVisibilityChange)
		}
	}, [])

	if (!locked) return null

	return (
		<div className="PrivacyCurtain" role="dialog" aria-modal="true" aria-label="Aplikace je skrytá">
			<img className="PrivacyCurtainIcon" src="/favicon.svg" alt="" />
			<button type="button" onClick={() => setLocked(false)} autoFocus>Odemknout</button>
		</div>
	)
}
