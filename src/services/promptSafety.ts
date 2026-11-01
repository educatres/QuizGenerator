import type { MaterialChunk, MaterialDocument } from '../domain/types';

/** A finding is intentionally generic so a malicious instruction is not echoed in the UI. */
export type PromptSafetyCategory = 'instruction_override' | 'identity_change' | 'system_prompt_extraction' | 'secret_extraction' | 'tool_execution';

export interface PromptSafetyFinding { category: PromptSafetyCategory; label: string; }

const rules: Array<{ category: PromptSafetyCategory; label: string; patterns: RegExp[] }> = [
  {
    category: 'instruction_override',
    label: '\u8981\u6c42\u5ffd\u7565\u6216\u8986\u5beb\u65e2\u6709\u6307\u4ee4',
    patterns: [
      /ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions?/i,
      /disregard\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions?/i,
      /\u5ffd\u7565(?:\u4e4b\u524d|\u4ee5\u4e0a|\u5148\u524d|\u6240\u6709).{0,24}(?:\u6307\u4ee4|\u898f\u5247|\u63d0\u793a|\u8981\u6c42)/u,
      /\u4e0d\u8981(?:\u9075\u5b88|\u7406\u6703).{0,24}(?:\u6307\u4ee4|\u898f\u5247|\u63d0\u793a)/u,
    ],
  },
  {
    category: 'identity_change',
    label: '\u8981\u6c42\u8b8a\u66f4 AI \u8eab\u5206\u6216\u89d2\u8272',
    patterns: [
      /(?:you are now|act\s+as|pretend\s+to\s+be|role[- ]?play\s+as)\b/i,
      /(?:\u4f60\u73fe\u5728\u662f|\u4f60\u662f|\u6539\u8b8a|\u5207\u63db|\u53d6\u4ee3).{0,20}(?:\u8eab\u5206|\u8eab\u4efd|\u89d2\u8272|\u4eba\u683c)/u,
      /(?:\u626e\u6f14|\u5047\u88dd|\u5192\u5145).{0,20}(?:\u52a9\u624b|\u7cfb\u7d71|\u7ba1\u7406\u54e1|\u4f7f\u7528\u8005|\u89d2\u8272)/u,
    ],
  },
  {
    category: 'system_prompt_extraction',
    label: '\u8981\u6c42\u63d0\u4f9b system/developer prompt \u6216\u96b1\u85cf\u6307\u4ee4',
    patterns: [
      /(?:reveal|show|print|repeat|output).{0,40}(?:system|developer|hidden).{0,30}prompt/i,
      /(?:system|developer|hidden)\s+(?:prompt|message|instructions?)/i,
      /(?:\u986f\u793a|\u63d0\u4f9b|\u63ed\u9732|\u91cd\u8ff0|\u8907\u88fd|\u6d29\u6f0f|\u544a\u8a34\u6211).{0,40}(?:\u7cfb\u7d71|\u958b\u767c\u8005|\u96b1\u85cf).{0,20}(?:\u63d0\u793a\u8a5e|prompt|\u6307\u4ee4|\u8a0a\u606f)/u,
      /(?:\u672c\s*chat|\u9019\u500b\u5c0d\u8a71|\u672c\u6b21\u5c0d\u8a71).{0,30}(?:system|\u7cfb\u7d71).{0,30}(?:prompt|\u63d0\u793a\u8a5e|\u6307\u4ee4)/iu,
    ],
  },
  {
    category: 'secret_extraction',
    label: '\u8981\u6c42\u63d0\u4f9b API \u91d1\u9470\u3001token \u6216\u74b0\u5883\u6a5f\u5bc6',
    patterns: [
      /(?:reveal|show|print|provide|output).{0,40}(?:api\s*key|access\s*token|secret|environment\s*variable)/i,
      /(?:\u986f\u793a|\u63d0\u4f9b|\u63ed\u9732|\u6d29\u6f0f|\u8f38\u51fa).{0,40}(?:API\s*Key|\u91d1\u9470|\u5bc6\u9470|token|\u6b0a\u6756|\u74b0\u5883\u8b8a\u6578)/iu,
    ],
  },
  {
    category: 'tool_execution',
    label: '\u8981\u6c42\u57f7\u884c\u5916\u90e8\u5de5\u5177\u3001\u547d\u4ee4\u6216\u7db2\u8def\u64cd\u4f5c',
    patterns: [
      /(?:run|execute|call|invoke)\s+(?:this\s+)?(?:tool|command|function|script)/i,
      /(?:\u57f7\u884c|\u547c\u53eb|\u4f7f\u7528).{0,20}(?:\u5de5\u5177|\u547d\u4ee4|\u6307\u4ee4|\u7a0b\u5f0f|\u8173\u672c).{0,20}(?:\u4e26|\u5f8c)/u,
      /(?:curl|powershell|cmd\.exe|bash\s+-c|rm\s+-rf)\b/i,
    ],
  },
];

function normalize(text: string) {
  return text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function scanPromptInjection(text: string): PromptSafetyFinding[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  return rules.filter(rule => rule.patterns.some(pattern => pattern.test(normalized))).map(({ category, label }) => ({ category, label }));
}

export function scanChunks(chunks: MaterialChunk[]) {
  const findings = chunks.flatMap(chunk => scanPromptInjection(chunk.text));
  return [...new Map(findings.map(finding => [finding.category, finding])).values()];
}

export function inspectMaterial(material: MaterialDocument): MaterialDocument {
  const findings = scanChunks(material.chunks);
  if (!findings.length) return material;
  return { ...material, securityWarning: `\u5075\u6e2c\u5230\u7591\u4f3c\u63d0\u793a\u8a5e\u6ce8\u5165\uff08${findings.map(finding => finding.label).join('\u3001')}\uff09\u3002\u6b64\u6559\u6750\u5df2\u6a19\u8a18\u70ba\u4e0d\u53ef\u4fe1\u5167\u5bb9\uff0c\u7522\u751f\u984c\u76ee\u524d\u6703\u963b\u6b62\u9001\u51fa\u3002` };
}

export function promptSafetyWarning(findings: PromptSafetyFinding[]) {
  if (!findings.length) return '';
  return `\u5075\u6e2c\u5230\u7591\u4f3c\u4e0d\u5b89\u5168\u63d0\u793a\u8a5e\uff1a${findings.map(finding => finding.label).join('\u3001')}\u3002\u70ba\u4fdd\u8b77 AI \u8a2d\u5b9a\u8207\u6a5f\u5bc6\uff0c\u5df2\u963b\u6b62\u9019\u6b21\u8acb\u6c42\uff1b\u8acb\u79fb\u9664\u53ef\u7591\u5167\u5bb9\u5f8c\u518d\u8a66\u3002`;
}
