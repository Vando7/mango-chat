#!/usr/bin/env node
// Unit tests for `extractNemotronMarkup` in src/api/client.js — covers the
// inline XML-style tool-call/reasoning extraction we apply when LM Studio
// doesn't surface structured tool_calls (e.g. nvidia/nemotron-3-nano).
import { extractNemotronMarkup } from '../src/api/client.js'

const fixtures = [
  { name: 'plain text — no markup',
    input: 'Hello there. The answer is 42.',
    want: { visible: 'Hello there. The answer is 42.', reasoning: '', toolCallsLen: 0 } },
  { name: 'simple think block',
    input: 'Here we go. <think>let me check</think>Done.',
    want: { visible: 'Here we go. Done.', reasoning: 'let me check', toolCallsLen: 0 } },
  { name: 'tool call without args',
    input: '<tool_call><function=mcp__date__now></function></tool_call>',
    want: { visible: '', toolCallsLen: 1, name: 'mcp__date__now', args: '{}' } },
  { name: 'tool call with two params, multi-line',
    input: 'Calling now.\n<tool_call>\n<function=mcp__date__today>\n<parameter=foo>\nbar\n</parameter>\n<parameter=count>\n42\n</parameter>\n</function>\n</tool_call>\nDone.',
    want: { toolCallsLen: 1, name: 'mcp__date__today', argsKeys: ['count', 'foo'] } },
  { name: 'partial tool_call still streaming — held back',
    input: 'Working...<tool_call>\n<function=foo>',
    want: { visible: 'Working...', toolCallsLen: 0 } },
  { name: 'partial think tag at buffer tail — held back',
    input: 'hello <thi',
    want: { visible: 'hello ', toolCallsLen: 0 } },
  { name: 'plain less-than — not a tag',
    input: 'if (x < 5) return',
    want: { visible: 'if (x < 5) return', toolCallsLen: 0 } },
  { name: 'malformed tool_call surfaces raw',
    input: '<tool_call>oops</tool_call>',
    want: { visibleContains: '<tool_call>oops</tool_call>', toolCallsLen: 0 } },
  { name: 'think + tool call combined',
    input: '<think>plan it</think>Sure.<tool_call><function=t><parameter=a>1</parameter></function></tool_call>',
    want: { visible: 'Sure.', reasoning: 'plan it', toolCallsLen: 1, name: 't', args: '{"a":1}' } },
]

let failed = 0
for (const f of fixtures) {
  const out = extractNemotronMarkup(f.input)
  const errs = []
  const w = f.want
  if (w.visible !== undefined && out.visible !== w.visible)
    errs.push(`visible: want ${JSON.stringify(w.visible)} got ${JSON.stringify(out.visible)}`)
  if (w.visibleContains && !out.visible.includes(w.visibleContains))
    errs.push(`visible should contain ${JSON.stringify(w.visibleContains)} got ${JSON.stringify(out.visible)}`)
  if (w.reasoning !== undefined && out.reasoning !== w.reasoning)
    errs.push(`reasoning: want ${JSON.stringify(w.reasoning)} got ${JSON.stringify(out.reasoning)}`)
  if (w.toolCallsLen !== undefined && out.toolCalls.length !== w.toolCallsLen)
    errs.push(`toolCalls length: want ${w.toolCallsLen} got ${out.toolCalls.length}`)
  if (w.name && out.toolCalls[0]?.function?.name !== w.name)
    errs.push(`tool name: want ${w.name} got ${out.toolCalls[0]?.function?.name}`)
  if (w.args && out.toolCalls[0]?.function?.arguments !== w.args)
    errs.push(`tool args: want ${w.args} got ${out.toolCalls[0]?.function?.arguments}`)
  if (w.argsKeys) {
    const got = Object.keys(JSON.parse(out.toolCalls[0]?.function?.arguments || '{}')).sort()
    if (JSON.stringify(got) !== JSON.stringify(w.argsKeys.slice().sort()))
      errs.push(`argsKeys: want ${w.argsKeys} got ${got}`)
  }
  if (errs.length === 0) {
    console.log(`ok   ${f.name}`)
  } else {
    failed++
    console.log(`FAIL ${f.name}`)
    for (const err of errs) console.log(`     ${err}`)
  }
}
console.log(failed === 0 ? '\nAll parser tests passed.' : `\n${failed} test(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
