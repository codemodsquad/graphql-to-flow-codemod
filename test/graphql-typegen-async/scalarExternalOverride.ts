import * as path from 'path'

export const file = path.join(__dirname, 'file.js')

export const input = `
// @flow
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  human(id: $id) {
    id
    name
    appearsIn
    # @graphql-typegen external as Birthday
    birthday
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expected = `
// @flow
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  human(id: $id) {
    id
    name
    appearsIn
    # @graphql-typegen external as Birthday
    birthday
  }
}
\`
// @graphql-typegen auto-generated
type TestQueryVariables = { id: string }

// @graphql-typegen auto-generated
type TestQueryData = {
  human: ?{
    id: string,
    name: string,
    appearsIn: Array<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
    birthday: ?Birthday,
  },
}
`
