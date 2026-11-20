export type EdgeKind = 'import' | 'require' | 'dynamic' | 'reexport';

export interface RawImport {
  specifier: string;
  kind: EdgeKind;
  isNonLiteral?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface Graph {
  nodes: string[];                 // normalized paths, wrapper folder stripped
  edges: GraphEdge[];
  unresolved: { from: string; specifier: string }[];  // external packages excluded
  unsupportedLanguages: string[];  // languages with no graph support
}
