import { useId } from 'react';
import { LOGO_MARK } from '../logo-mark';

/**
 * The GitFlux mark: three snapshots joined by their history, you (white) and two branches (green).
 * Always an ink tile, so it reads the same on light and dark pages. Drawn by scripts/logo.mjs.
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  // each copy gets its own gradient ids, so two logos on one page never share them
  const id = 'gf' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_MARK.replace(/gf/g, id) }} />;
}
