import type { MDXComponents } from "mdx/types";

// Next.js requires this file at the project root when using @next/mdx.
// Map MDX elements to custom components here.
const components: MDXComponents = {};

export function useMDXComponents(): MDXComponents {
  return components;
}
