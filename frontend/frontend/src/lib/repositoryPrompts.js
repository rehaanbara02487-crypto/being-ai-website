export function isRepositoryEditPrompt(prompt) {
  const lowered = prompt.toLowerCase().trim();
  const editVerbs =
    /\b(add|fix|update|implement|refactor|remove|delete|rename|change|modify|patch|repair|optimize|enable|disable|introduce|integrate|wire|connect)\b/;
  const editTargets =
    /\b(dark mode|dark theme|authentication|auth|search|pagination|error|bug|build|test|feature|component|route|api|model|service|ui|layout|style|theme|login|signup|navbar|sidebar|button|form|validation|typescript|eslint)\b/;
  const fixPatterns =
    /\b(fix|resolve|debug|repair)\b.*\b(error|issue|bug|build|failure|failed|warning)\b/;

  if (fixPatterns.test(lowered)) {
    return true;
  }

  return editVerbs.test(lowered) && editTargets.test(lowered);
}

export function isRepositorySearchPrompt(prompt) {
  const trimmed = prompt.trim();
  if (/^find\b/i.test(trimmed)) {
    return true;
  }
  if (/\bwhere is\b/i.test(trimmed)) {
    return true;
  }
  return /\b(find|locate|show)\b.*\b(authentication|auth|api routes|routes|database models|models|unused code|components|services)\b/i.test(
    trimmed
  );
}

export function isFixErrorPrompt(prompt) {
  return /\b(fix current error|fix this error|fix build error|fix the error|fix terminal error)\b/i.test(
    prompt.trim()
  );
}
