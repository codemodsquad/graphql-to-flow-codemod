import { FileInfo, API, Options } from 'jscodeshift'
import pkgConf from 'pkg-conf'
import { applyConfigDefaults } from './config'
import { analyzeSchemaSync } from './analyzeSchema'
import * as path from 'path'
import graphqlTypegenCore from './graphqlTypegenCore'

module.exports = function graphqlTypegen(
  fileInfo: FileInfo,
  api: API,
  options: Options
): string {
  const { path: file } = fileInfo
  const packageConf = pkgConf.sync('graphql-typegen', {
    cwd: path.dirname(file),
  })
  if (packageConf?.schemaFile) {
    const packageDir = path.dirname(pkgConf.filepath(packageConf) as any)
    packageConf.schemaFile = path.resolve(
      packageDir,
      packageConf.schemaFile as any
    )
  }
  const config = applyConfigDefaults(Object.assign(packageConf, options))
  const { schemaFile, server } = config
  const schema = analyzeSchemaSync({ schemaFile, server })
  return graphqlTypegenCore(fileInfo, api, options, { schema })
}
