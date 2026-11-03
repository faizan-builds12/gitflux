import { LOGO_MARK } from "./logo-mark";

/** The GitFlux mark, exactly as in the product (drawn by scripts/logo.mjs). */
export const Logo: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: LOGO_MARK }} />
);
