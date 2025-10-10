module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
  plugins: [
    () => ({
      visitor: {
        MetaProperty(path) {
          if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
            // Replace "import.meta" with "process"
            path.replaceWithSourceString('process');
          }
        },
      },
    }),
  ],
};
