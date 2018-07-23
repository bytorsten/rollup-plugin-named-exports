import { walk } from 'estree-walker';
import MagicString from 'magic-string';

export default function replaceDefaultRequires({ rawCode, ast }) {

  const requires = [];
  const code = new MagicString(rawCode);
  let replaced = false;
  walk(ast, {
    enter: (node, parentNode) => {
      if (
        node.type === 'CallExpression' &&
        node.callee.name === 'require' &&
        parentNode.type === 'VariableDeclarator'
      ) {
        requires.push(parentNode.id.name);
      }

      if (
        node.type === 'MemberExpression' &&
        node.object.type === 'CallExpression' &&
        node.object.callee.name === 'require' &&
        node.property.name === 'default'
      ) {
        replaced = true;
        code.overwrite(node.start, node.end, `require(${node.object.arguments[0].raw})`);
      }

      if (
        node.type === 'MemberExpression' &&
        node.property.name === 'default' &&
        ~requires.indexOf(node.object.name)
      ) {
        replaced = true;
        code.overwrite(node.start, node.end, node.object.name);
      }
    }
  });

  return replaced ? {
    code: code.toString(),
    map: code.generateMap({
      hires: true
    })
  } : null;
}
