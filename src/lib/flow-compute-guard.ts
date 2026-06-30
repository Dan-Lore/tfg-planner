/** True when worker result still matches the scheme revision at request start. */
export function shouldApplyFlowResult(
  revisionAtStart: string,
  currentRevision: string,
): boolean {
  return revisionAtStart === currentRevision;
}
