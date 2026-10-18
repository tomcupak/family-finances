import '../../../shared/index.css'
import '../../../shared/App.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'

// config.json is the runtime config (deploy symlinks it to /etc/family-finances/web/config.json),
// so one build works on every host. Without it the index.html placeholder (localhost) stays.
async function loadConfig() {
	try {
		const res = await fetch('/config.json', { cache: 'no-store' })
		const cfg: unknown = await res.json()
		if (cfg && typeof cfg === 'object' && 'apiUrl' in cfg && typeof cfg.apiUrl === 'string') {
			window.config = { ...window.config, apiUrl: cfg.apiUrl }
		}
	} catch (err) {
		console.error('config.json could not be loaded', err)
	}
}

void loadConfig().then(() => {
	createRoot(document.getElementById('root') as HTMLElement).render(
		<StrictMode>
			<App />
		</StrictMode>,
	)
})
