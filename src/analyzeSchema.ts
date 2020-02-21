/* eslint-disable @typescript-eslint/no-use-before-define */

import gql from 'graphql-tag'
import graphql from 'graphql'
import superagent from 'superagent'
import getConfigDirectives, { ConfigDirectives } from './getConfigDirectives'

const typesQuery = gql`
  fragment typeInfo on __Type {
    name
    kind
    ofType {
      name
      kind
      ofType {
        name
        kind
        ofType {
          name
        }
      }
    }
  }
  query getTypes {
    __schema {
      types {
        kind
        name
        description
        enumValues {
          name
        }
        fields {
          name
          args {
            name
            type {
              ...typeInfo
            }
          }
          type {
            ...typeInfo
          }
        }
        inputFields {
          name
          type {
            ...typeInfo
          }
        }
      }
    }
  }
`

export type TypeKind =
  | 'SCALAR'
  | 'OBJECT'
  | 'INTERFACE'
  | 'UNION'
  | 'ENUM'
  | 'INPUT_OBJECT'
  | 'LIST'
  | 'NON_NULL'

export type IntrospectionArg = {
  name: string
  type: IntrospectionType
  description: string
}

export type AnalyzedArg = {
  name: string
  type: AnalyzedType
  description: string
  config?: ConfigDirectives
}

export type IntrospectionField = {
  name: string
  args: IntrospectionArg[]
  type: IntrospectionType
  description: string
}

export type AnalyzedField = {
  name: string
  args: Record<string, AnalyzedArg>
  type: AnalyzedType
  description: string
  parent?: AnalyzedType
  config?: ConfigDirectives
}

export type IntrospectionInputField = {
  name: string
  type: IntrospectionType
  description: string
}

export type AnalyzedInputField = {
  name: string
  type: AnalyzedType
  description: string
  parent?: AnalyzedType
  config?: ConfigDirectives
}

export type EnumValue = {
  name: string
  description: string
}

export type IntrospectionType = {
  kind: TypeKind
  name: string
  description: string
  ofType?: IntrospectionType | null
  fields?: IntrospectionField[] | null
  inputFields?: IntrospectionInputField[] | null
  enumValues?: EnumValue[] | null
}

export type AnalyzedType = {
  kind: TypeKind
  name: string
  description: string
  ofType?: AnalyzedType | null
  fields?: Record<string, AnalyzedField> | null
  inputFields?: Record<string, AnalyzedInputField> | null
  enumValues?: EnumValue[] | null
  parents?: Array<AnalyzedField | AnalyzedInputField>
  config?: ConfigDirectives
}

function convertIntrospectionArgs(
  args: IntrospectionArg[]
): Record<string, AnalyzedArg> {
  const AnalyzedArgs: Record<string, AnalyzedArg> = {}
  for (const { name, type, description } of args) {
    AnalyzedArgs[name] = {
      name,
      type: convertIntrospectionType(type),
      description,
      config: getConfigDirectives(description.split(/\n/gm)),
    }
  }
  return AnalyzedArgs
}

function convertIntrospectionField({
  name,
  args,
  type,
  description,
}: IntrospectionField): AnalyzedField {
  return {
    name,
    type: convertIntrospectionType(type),
    args: convertIntrospectionArgs(args),
    description,
    config: getConfigDirectives(description.split(/\n/gm)),
  }
}

function convertIntrospectionFields(
  fields: IntrospectionField[]
): Record<string, AnalyzedField> {
  const AnalyzedFields: Record<string, AnalyzedField> = {}
  for (const field of fields) {
    AnalyzedFields[field.name] = convertIntrospectionField(field)
  }
  return AnalyzedFields
}

function convertIntrospectionInputField({
  name,
  type,
  description,
}: IntrospectionInputField): AnalyzedInputField {
  return {
    name,
    type: convertIntrospectionType(type),
    description,
    config: getConfigDirectives(description.split(/\n/gm)),
  }
}

function convertIntrospectionInputFields(
  fields: IntrospectionInputField[]
): Record<string, AnalyzedInputField> {
  const AnalyzedFields: Record<string, AnalyzedInputField> = {}
  for (const field of fields) {
    AnalyzedFields[field.name] = convertIntrospectionInputField(field)
  }
  return AnalyzedFields
}

function convertIntrospectionType({
  name,
  description,
  kind,
  ofType,
  fields,
  inputFields,
  enumValues,
}: IntrospectionType): AnalyzedType {
  return {
    name,
    description,
    kind,
    ofType: ofType ? convertIntrospectionType(ofType) : null,
    fields: fields ? convertIntrospectionFields(fields) : null,
    inputFields: inputFields
      ? convertIntrospectionInputFields(inputFields)
      : null,
    enumValues,
    config: getConfigDirectives(description.split(/\n/gm)),
  }
}

function analyzeTypes(
  introspectionTypes: Array<IntrospectionType>
): Record<string, AnalyzedType> {
  const types: Record<string, AnalyzedType> = {}

  for (const introspectionType of introspectionTypes) {
    const { name } = introspectionType
    if (name) {
      types[name] = convertIntrospectionType(introspectionType)
    }
  }
  function resolveType(
    type: AnalyzedType,
    parent?: AnalyzedField | AnalyzedInputField
  ): AnalyzedType {
    const { name, ofType } = type
    if (name && types[name]) type = types[name]
    if (ofType) type.ofType = resolveType(ofType, parent)
    if (parent) {
      let { parents } = type
      if (!parents) type.parents = parents = []
      parents.push(parent)
    }
    return type
  }
  for (const name in types) {
    const type = types[name]
    const { fields, inputFields } = type
    if (fields) {
      for (const name in fields) {
        const field = fields[name]
        field.type = resolveType(field.type, field)
        for (const name in field.args) {
          const arg = field.args[name]
          arg.type = resolveType(arg.type)
        }
        field.parent = type
      }
    }
    if (inputFields) {
      for (const name in inputFields) {
        const field = inputFields[name]
        field.type = resolveType(field.type, field)
        field.parent = type
      }
    }
  }
  return types
}

export default async function analyzeSchema({
  schema,
  server,
}: {
  schema?: graphql.GraphQLSchema
  server?: string
}): Promise<Record<string, AnalyzedType>> {
  let result: graphql.ExecutionResult<{
    __schema: { types: IntrospectionType[] }
  }>
  if (schema) result = await graphql.execute(schema, typesQuery)
  else if (server) {
    result = (
      await superagent
        .post(server)
        .type('json')
        .accept('json')
        .send({
          query: typesQuery,
        })
    ).body
  } else {
    throw new Error('schema or server must be provided')
  }
  const { data } = result
  if (!data) throw new Error('failed to get introspection query data')
  const {
    __schema: { types },
  } = data
  return analyzeTypes(types)
}
