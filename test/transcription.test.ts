import { describe, expect, it } from 'vitest'

import type { JsonObject } from '../src/doc/model'
import { compareText, emptyTranscription, fieldPrompt, fromRecord, isbnDigits, parseTranscription, score } from '../src/assist/transcription'

describe('comparing a reading with the record', () => {
  it('ignores spacing and the punctuation that ends a MARC subfield', () => {
    expect(compareText('  Reports of cases  ', 'Reports of cases /')).toEqual({ outcome: 'exact', differences: [] })
  })

  it('calls it close when only case, punctuation or diacritics differ, saying which', () => {
    expect(compareText('LES MISÉRABLES', 'Les misérables')).toEqual({ outcome: 'close', differences: ['case'] })
    expect(compareText('Les miserables', 'Les misérables')).toEqual({ outcome: 'close', differences: ['diacritics'] })
    expect(compareText('LES MISERABLES!', 'Les misérables')).toEqual({ outcome: 'close', differences: ['case', 'punctuation', 'diacritics'] })
  })

  it('treats composed and decomposed accents as the same', () => {
    expect(compareText('Les misérables', 'Les misérables').outcome).toBe('exact')
  })

  it('tells missing, added, wrong and absent apart', () => {
    expect(compareText('', 'Dublin').outcome).toBe('missed')
    expect(compareText('Dublin', '').outcome).toBe('added')
    expect(compareText('Victor Hugo', 'par Victor Hugo').outcome).toBe('wrong')
    expect(compareText('', '').outcome).toBe('absent')
  })

  it('compares ISBNs as sets of digits', () => {
    const read = { ...emptyTranscription(), isbn: ['978-2-07-040850-4'] }
    expect(score(read, { ...emptyTranscription(), isbn: ['9782070408504'] }).isbn.outcome).toBe('exact')
    expect(score(read, { ...emptyTranscription(), isbn: ['9782070408504', '2070408507'] }).isbn.outcome).toBe('close')
    expect(score(read, { ...emptyTranscription(), isbn: ['2070408507'] }).isbn.outcome).toBe('wrong')
  })
})

describe('an ISBN', () => {
  it('keeps only digits and X, dropping a qualifier', () => {
    expect(isbnDigits('0-19-852663-x (pbk.)')).toBe('019852663X')
    expect(isbnDigits('(pbk.)')).toBe('')
  })
})

describe('the fields from a record', () => {
  it('reads the transcribed title, statements, publication and ISBNs', () => {
    const instance: JsonObject = {
      title: [
        { '@type': ['VariantTitle'], mainTitle: ['Rolls Court reports'] },
        { '@type': ['Title'], mainTitle: [{ '@value': 'Reports of cases', '@language': 'en' }], subtitle: ['during the time of Sir William McMahon'] },
      ],
      responsibilityStatement: ['by William Hogan'],
      provisionActivity: [
        { '@type': ['ProvisionActivity', 'Manufacture'], 'bflc:simplePlace': ['Leeds'] },
        { '@type': ['ProvisionActivity', 'Publication'], 'bflc:simplePlace': ['Dublin', 'London'], 'bflc:simpleAgent': ['Richard Milliken and Son'], 'bflc:simpleDate': ['1828-1838'] },
      ],
      identifiedBy: [
        { '@type': ['Lccn'], 'rdf:value': ['unk84236573'] },
        { '@type': ['Isbn'], 'rdf:value': ['0198526636 (pbk.)'] },
      ],
    }
    expect(fromRecord(instance)).toEqual({
      mainTitle: 'Reports of cases',
      subtitle: 'during the time of Sir William McMahon',
      responsibility: 'by William Hogan',
      edition: '',
      place: 'Dublin ; London',
      publisher: 'Richard Milliken and Son',
      date: '1828-1838',
      isbn: ['0198526636'],
    })
  })
})

describe('the model’s answer', () => {
  it('is read leniently, leaving a missing or mistyped field empty', () => {
    expect(parseTranscription('{"mainTitle": "Maps", "date": 2019, "isbn": ["123", 4]}')).toEqual({
      ...emptyTranscription(),
      mainTitle: 'Maps',
      isbn: ['123'],
    })
  })
})

describe('the lines given to the second step', () => {
  it('say which photo each came from', () => {
    expect(fieldPrompt(['[large] LES MISÉRABLES\n[small] par Victor Hugo\n', '[small] ISBN 978-2-07-040850-4'])).toBe(
      'Photo 1:\n[large] LES MISÉRABLES\n[small] par Victor Hugo\n\nPhoto 2:\n[small] ISBN 978-2-07-040850-4',
    )
  })
})
