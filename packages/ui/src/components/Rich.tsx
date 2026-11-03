import { Fragment } from 'react';

/** Branch chip, coloured like its lane on the map. */
export function Chip({ name, color }: { name: string; color?: string }) {
  return <span className="chip" style={{ ['--c' as string]: color ?? 'var(--text)' }}><i />{name}</span>;
}

/** Render an event sentence where branch names are written as [[name]]. */
export function Rich({ text, colorOf }: { text: string; colorOf: (b: string) => string }) {
  const parts = text.split(/\[\[(.+?)\]\]/);
  return <>{parts.map((p, i) => (i % 2 ? <Chip key={i} name={p} color={colorOf(p)} /> : <Fragment key={i}>{p}</Fragment>))}</>;
}

export const plainText = (text: string) => text.replace(/\[\[(.+?)\]\]/g, '$1');
