// lib/sessionValidator.js
// Programmatic validation of AI-generated session output.

import { hasRestriction } from './exerciseRestrictions';

const FORBIDDEN_PATTERNS = [
  /back squat|классический присед|присед.*со штанг.*спин/i,
  /bench press|жим лёжа(?!.*наклон)/i,
  /bent.?over row|тяга.*наклон|barbell row/i,
  /nordic curl|nordic hamstring|нордик/i,
  /ab wheel|ab roller|ролик.*пресс|rollout/i,
  /broad jump|прыжок в длину/i,
  /floor press|жим.*пол[уе]|жим на полу/i,
  /wrist stability|стабилизация запястья|band.*wrist/i,
  /jump set drill|прыжок.*передач|имитация передачи/i,
  /kb press|жим.*гир[яеи]\b|kettlebell press/i,
  /tricep.*band.*pushdown|band.*tricep|pushdown.*петл|разгибание.*локт.*петл/i,
];

// #12: High-load block codes that must not appear when ACWR is critical
const HIGH_INTENSITY_CODES = /^[AB]2/i;

export function validateSession(session, playerRestrictions = [], snapshot = null) {
  const errors = [];
  const warnings = [];

  if (!session?.blocks?.length) {
    errors.push('Сессия не содержит блоков');
    return { valid: false, errors, warnings };
  }

  for (const block of session.blocks) {
    const code = block.code || block.label || '?';
    for (const ex of block.exercises || []) {
      const name = ex.name || '';

      // Check forbidden exercises
      for (const re of FORBIDDEN_PATTERNS) {
        if (re.test(name)) {
          errors.push(`Запрещённое упражнение в блоке ${code}: "${name}"`);
        }
      }

      // Check player restrictions
      if (playerRestrictions.length && hasRestriction(name, playerRestrictions)) {
        errors.push(`Упражнение "${name}" нарушает ограничения игрока`);
      }

      // Check weight sanity (if 1RM-based)
      if (ex.weightKg && parseFloat(ex.weightKg) > 300) {
        warnings.push(`Подозрительно высокий вес в "${name}": ${ex.weightKg} кг`);
      }
    }
  }

  // Check E-block exists (prophylaxis)
  const hasEBlock = session.blocks.some(
    b => b.code === 'E' || (b.label || '').toUpperCase() === 'E' || (b.label || '').toLowerCase().includes('проф')
  );
  if (!hasEBlock) {
    warnings.push('Отсутствует E-блок профилактики');
  }

  // #12: Dosage validator — block A2/B2 (explosive/plyometric) when ACWR is critical
  if (snapshot) {
    const acwr = snapshot.acwr ?? null;
    if (acwr != null && acwr > 1.5) {
      for (const block of session.blocks) {
        const code = block.code || block.label || '';
        if (HIGH_INTENSITY_CODES.test(code)) {
          errors.push(`Блок ${code} (взрывная нагрузка) недопустим при ACWR=${acwr} >1.5 — высокий риск травмы. Убрать плиометрику и скоростные движения.`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
