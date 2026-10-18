module.exports = {
	familyFinancesApi: {
		output: {
			mode: 'tags-split',
			target: 'apps/family-finances/src/api/schema/index.ts',
			schemas: 'apps/family-finances/src/api/schema/models',
			client: 'axios',
			override: {
				mutator: {
					path: 'apps/family-finances/src/api/customInstance.ts',
					name: 'customInstance',
				},
			},
		},
		input: 'http://localhost:3000/swagger/json',
	},
}
