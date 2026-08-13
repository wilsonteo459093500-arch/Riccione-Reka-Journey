import {
  MODES,
  ROOM_TYPES,
  STYLES,
  LIGHTING_OPTIONS,
  FIDELITY_OPTIONS,
  POLISH_SCOPES,
  REF_IMAGE_PROMPT,
  ARCHITECTURE_LOCK,
  AMBIGUOUS_MATERIAL_RULE,
  LIGHTING_REALISM,
  QUALITY_SUFFIX,
} from './constants.js';

/**
 * 把用户的选择组装成一条专业级英文 prompt。
 * 结构：角色设定 → (参考图说明) → 模式任务 → 空间 → 风格四层描述 → 灯光 → 结构保真 → 润饰范围 → 用户补充 → 画质收尾。
 */
export function buildPrompt({
  modeId,
  roomId,
  styleId,
  lightingId,
  fidelityId,
  polishScopeId,
  hasRef,
  extra,
  variationIndex,
}) {
  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  const room = ROOM_TYPES.find((r) => r.id === roomId);
  const style = STYLES.find((s) => s.id === styleId);
  const lighting = LIGHTING_OPTIONS.find((l) => l.id === lightingId);
  const fidelity = FIDELITY_OPTIONS.find((f) => f.id === fidelityId);
  const polishScope = POLISH_SCOPES.find((p) => p.id === polishScopeId);

  const lines = ['You are a top-tier interior designer and architectural visualization artist.'];
  if (hasRef) lines.push(REF_IMAGE_PROMPT);
  lines.push(mode.prompt);

  if (mode.id === 'polish' && polishScope) {
    lines.push(polishScope.prompt);
  }

  // 三条铁律：结构锁（所有带图模式）、材质歧义规则（草图）、灯光真实感（精修以外的出图模式）
  if (mode.needsImage) lines.push(ARCHITECTURE_LOCK);
  if (mode.id === 'sketch') lines.push(AMBIGUOUS_MATERIAL_RULE);
  if (['restyle', 'empty', 'sketch'].includes(mode.id)) lines.push(LIGHTING_REALISM);

  if (room && !mode.skipRoom) {
    lines.push(`The space is a ${room.en}; the design must suit how this room type is actually used.`);
  }

  if (!mode.skipStyle && style && style.id !== 'custom' && style.prompt) {
    lines.push(`Target style — ${style.en}: ${style.prompt}.`);
  }

  if (lighting && lighting.prompt) {
    lines.push(`Lighting: ${lighting.prompt}.`);
  }

  // 结构保真只对有图片输入、且非草图模式以外的模式有意义；
  // 草图模式本身已要求严格跟随线稿，指令修改模式已要求只改指定内容。
  if (
    mode.needsImage &&
    !mode.skipFidelity &&
    mode.id !== 'sketch' &&
    mode.id !== 'edit' &&
    fidelity &&
    fidelity.prompt
  ) {
    lines.push(fidelity.prompt);
  }

  if (extra && extra.trim()) {
    const label = mode.needsInstruction ? 'Instruction from the designer' : 'Additional requirements from the designer';
    lines.push(`${label}: ${extra.trim()}`);
  }

  if (variationIndex > 0) {
    lines.push(
      `This is variation #${variationIndex + 1}: keep the same style and constraints, ` +
        'but explore a noticeably different furniture selection, decor and color detailing.'
    );
  }

  lines.push(QUALITY_SUFFIX);

  return lines.join('\n');
}
