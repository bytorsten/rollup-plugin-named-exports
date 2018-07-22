import fs from 'fs';
import MagicString from 'magic-string';

import extractNamedImports from './extractNamedImports';
import extractNamedExports from './extractNamedExports';

const IMPORT_EXPORT_DECLARATION_PATTERN = /^(?:Import|Export(?:Named|Default))Declaration/;

const extracedNamedExports = [];
let globalImportIndex = 0;

const readFile = path => new Promise((resolve, reject) => {
  fs.readFile(path, 'utf8', (error, content) => {
    if (error) {
      reject(error);
    } else {
      resolve(content);
    }
  });
});

const isCjsModule = ast => {
  for (const node of ast.body) {
    if (IMPORT_EXPORT_DECLARATION_PATTERN.test(node.type)) {
      return false;
    }
  }

  return true;
};

export default function namedExports(options = {}) {

  return {
    name: 'namedExports',

    async transform(rawCode, id) {

      // we only handle user code
      if (~id.indexOf('node_modules') || id[0] !== '/') {
        return null;
      }

      const { imports, injectionIndex } = extractNamedImports(this.parse(rawCode));
      if (imports.length === 0) {
        return null;
      }

      const transformedImports = (await Promise.all(
        imports.map(async ({ lib, namedImports, ...rest }) => {
          const path = await this.resolveId(lib, id);
          const moduleCode = await readFile(path);
          const ast = this.parse(moduleCode);

          if (isCjsModule(ast)) {
            const namedExports = extractNamedExports(ast);
            const unresolvedNamedImports = {};
            const filteredNamedImports = {};

            for (const namedImport in namedImports) {
              if (~namedExports.indexOf(namedImport)) {
                filteredNamedImports[namedImport] = namedImports[namedImport];
              } else {
                unresolvedNamedImports[namedImport] = namedImports[namedImport];
              }
            }

            if (Object.keys(unresolvedNamedImports).length === 0) {
              return false;
            }

            return { lib, namedImports: filteredNamedImports, unresolvedNamedImports, ...rest };
          } else {
            extracedNamedExports[lib] = false;
            return false;
          }
        })
      )).filter(Boolean);

      if (transformedImports.length === 0) {
        return null;
      }

      const code = new MagicString(rawCode);
      const destructions = [];
      for (let { defaultImport, namedImports, unresolvedNamedImports, lib, start, end } of transformedImports) {
        defaultImport = defaultImport || `__import$${globalImportIndex++}`;

        let importDeclaration = `import ${defaultImport}`;
        if (Object.keys(namedImports).length > 0) {
          importDeclaration += ', {';
          importDeclaration += Object.keys(namedImports).map(namedImport => {
            const asDeclaration = namedImports[namedImport];
            if (asDeclaration !== namedImport) {
              return `${namedImport} as ${asDeclaration}`;
            }

            return namedImport;
          }).join(', ');
          importDeclaration += '}';
        }

        importDeclaration += ` from '${lib}';`;

        code.overwrite(start, end, importDeclaration);

        const destructionNames = Object.keys(unresolvedNamedImports).map(unresolvedNamedImport => {
          const asDeclaration = unresolvedNamedImports[unresolvedNamedImport];

          if (asDeclaration !== unresolvedNamedImport) {
            return `${unresolvedNamedImport}: ${asDeclaration}`;
          }

          return unresolvedNamedImport;
        }).join(', ');

        destructions.push(`const {${destructionNames}} = ${defaultImport};`);
      }

      code.appendLeft(injectionIndex, `\n${destructions.join('\n')}\n`);

      console.log(code.toString());

      return {
        code: code.toString(),
        map: code.generateMap()
      };
    }
  };
};
