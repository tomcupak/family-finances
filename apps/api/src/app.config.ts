// The dev defaults are public in this repository - in production (NODE_ENV=production, set by the
// systemd unit) refuse to start without the real value instead of silently falling back to them.
function secret(name: string, devDefault: string): string {
	const value = process.env[name]
	if (value) return value
	if (process.env.NODE_ENV === 'production') throw new Error(`${name} must be set in production`)
	return devDefault
}

export const config = {
	port: Number(process.env.API_PORT || 3000),
	host: process.env.API_HOST || '0.0.0.0',
	cors: process.env.CORS ?? 'http://localhost:5173',
	apiToken: secret('API_TOKEN', 'dev-token'),

	openApi: {
		version: '1.0.0',
		title: 'Family Finances API',
		description: 'Family Finances API',
	},

	db: {
		host: process.env.POSTGRES_HOST || 'localhost',
		port: Number(process.env.POSTGRES_PORT || 10400),
		database: process.env.POSTGRES_DB || 'family_finances',
		user: process.env.POSTGRES_USER || 'postgres',
		password: secret('POSTGRES_PASSWORD', 'postgres'),
		pool: Number(process.env.POSTGRES_POOL || 4),
	},
	dbMigrationsPath: process.env.MIGRATIONS_PATH || '../../../libs/database/src/core/migrations',
}
