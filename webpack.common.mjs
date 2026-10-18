import fs from 'fs'
import GeneratePackageJsonPlugin from 'generate-package-json-webpack-plugin'
import path from 'path'
import nodeExternals from 'webpack-node-externals'

const packageRaw = fs.readFileSync('package.json')
const packageJson = JSON.parse(packageRaw)

export default (appName, version = '1.0.0') => ({
	plugins: [
		new GeneratePackageJsonPlugin({
			'name': `family-finances/${appName}`,
			'version': version,
			'main': './main.js',
			'engines': packageJson.engines,
		})
	],
	output: {
		path: path.resolve(`dist/apps/${appName}`),
	},
	// The npm workspaces symlink libs/* into node_modules/@family-finances/*, so Nest's default
	// nodeExternals() would leave them as runtime require()s of TS source - bundle them instead.
	externals: [nodeExternals({ allowlist: [/^@family-finances\//] })],
})
