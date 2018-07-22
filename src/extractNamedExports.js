export default function extractNamedExports(ast) {
  const namedExports = [];
  for (const { expression } of ast.body) {
    if (!(expression && expression.left && expression.left.type === 'MemberExpression')) {
      continue;
    }

    const { left: { object, property } } = expression;

    if (object.type === 'Identifier' && object.name === 'exports') {
      namedExports.push(property.name);
    } else if (object.type === 'MemberExpression' && object.object.name === 'module' && object.property.name === 'exports') {
      namedExports.push(property.name);
    }
  }

  return namedExports;
}
