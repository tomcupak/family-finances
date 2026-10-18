import init from '../../webpack.common.mjs'

const { output, plugins, externals } = init('api')
export { externals, output, plugins }
