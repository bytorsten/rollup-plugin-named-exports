import fs from 'fs';
import MagicString from 'magic-string';
import { createFilter } from 'rollup-pluginutils';

import extractNamedImports from './extractNamedImports';
import extractNamedExports from './extractNamedExports';

const IMPORT_EXPORT_DECLARATION_PATTERN = /^(?:Import|Export(?:Named|Default))Declaration/;

const extracedNamedExports = [];
let loader;
let globalImportIndex = 0;

const readFile = path => new Promise(async (resolve, reject) => {

  const content = await loader(path);

  if (content) {
    return resolve(content);
  }

  // fall back to file loading
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

  const filter = createFilter( options.include, options.exclude );


  return {
    name: 'namedExports',

    options(options) {

      const loaders = (options.plugins || []).map(plugin => plugin.load).filter(Boolean);

      loader = async id => {
        for (const load of loaders) {
          const result = await load(id);
          if (result) {
            return result;
          }
        }
      };
    },

    async transform(rawCode, id) {
      
      // we only handle user code and no commonjs-proxies
      if (!filter( id ) || ~id.indexOf('node_modules') || ~id.indexOf('commonjs-proxy')) {
        return null;
      }

      const { imports, injectionIndex } = extractNamedImports(this.parse(rawCode));
      if (imports.length === 0) {
        return null;
      }

      const transformedImports = (await Promise.all(
        imports.map(async ({ lib, namedImports, ...rest }) => {
          if (this.isExternal(lib, id)) {
            return false;
          }

          const path = await this.resolveId(lib, id);
          if (path === null) {
            this.warn(`Could not resolve path to "${lib}"`);
            return false;
          }

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

      return {
        code: code.toString(),
        map: code.generateMap()
      };
    }
  };
};
