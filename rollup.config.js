import pkg from './package.json';

export default {
  input: 'src/index.js',
  external: Object.keys(pkg.dependencies).concat(['fs']),
  output: [
    {
      format: 'es',
      file: pkg.module,
      sourcemap: true
    },
    {
      format: 'cjs',
      file: pkg.main,
      sourcemap: true
    }
  ]
};
