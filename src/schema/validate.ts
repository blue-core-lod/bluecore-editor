import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020'

import bounded from './bibframe-json/bounded.json'
import linked from './bibframe-json/linked.json'
import ontology from './bibframe-json/ontology.json'

/**
 * Checks documents against the vendored bibframe-json v0.1 schemas.
 *
 * Two verdicts, kept apart because they mean different things to a cataloger:
 * the shape schemas (linked, bounded) say whether a document is well-formed and
 * can be saved, and the ontology's domains and ranges are warnings, the source
 * of the teaching notes. bibframe-json reads the ontology as warnings because
 * "when the data and the ontology disagree, the ontology is often the one that
 * is behind", so they never block anything.
 */
export interface Validators {
  linked: ValidateFunction
  bounded: ValidateFunction
  ontology: ValidateFunction
}

export type { ErrorObject }

export function createValidators(): Validators {
  const ajv = new Ajv2020({ allErrors: true })
  // Annotations the generator writes into ontology.json; they carry provenance
  // for human readers and no validation meaning.
  ajv.addKeyword('x-bibframe-version')
  ajv.addKeyword('x-skipped')
  ajv.addSchema(linked)
  ajv.addSchema(bounded)
  ajv.addSchema(ontology)
  return {
    linked: compiled(ajv, linked.$id),
    bounded: compiled(ajv, bounded.$id),
    ontology: compiled(ajv, ontology.$id),
  }
}

let shared: Validators | undefined

/** One set of validators for the whole app; compiling the ontology takes a moment. */
export function getValidators(): Validators {
  shared ??= createValidators()
  return shared
}

function compiled(ajv: Ajv2020, id: string): ValidateFunction {
  const validate = ajv.getSchema(id)
  if (!validate) throw new Error(`schema ${id} did not compile`)
  return validate
}
