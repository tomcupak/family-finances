const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig.json')

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	modulePaths: [compilerOptions.baseUrl],
	moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
	moduleFileExtensions: ['js', 'json', 'ts'],
	rootDir: '.',
	testRegex: '.*\\.spec\\.ts$',
	collectCoverageFrom: ['(apps|libs)/**/*.(t|j)s'],
	coverageDirectory: '<rootDir>/coverage',
	globalSetup: '<rootDir>/jest.global-setup.ts',
	setupFiles: ['<rootDir>/jestSetEnvs.ts'],
	setupFilesAfterEnv: ['<rootDir>/jestSetupAfterEnv.ts'],
	detectOpenHandles: true,
	forceExit: true,
}
