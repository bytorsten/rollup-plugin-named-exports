export default function extractNamedImports(ast) {

  const imports = [];
  let injectionIndex = null;

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {

      injectionIndex = node.end;

      const lib = node.source.value;
      let defaultImport;
      let namedImports = {};

      // ignore relative imports
      if (lib[0] === '.') {
        continue;
      }

      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportDefaultSpecifier') {
          defaultImport = specifier.local.name;
        } else if (specifier.type === 'ImportSpecifier') {
          namedImports[specifier.imported.name] = specifier.local.name;
        }
      }

      if (Object.keys(namedImports).length === 0) {
        continue;
      }

      imports.push({
        lib,
        defaultImport,
        namedImports,
        start: node.start,
        end: node.end
      });
    }
  }

  return { imports, injectionIndex };
};
