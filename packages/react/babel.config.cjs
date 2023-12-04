module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
  plugins: [
    function () {
      return {
        visitor: {
          MetaProperty(path) {
            // replace e.g. import.meta.env.GOOGLE_AUTH_ORIGINS into process.env.GOOGLE_AUTH_ORIGINS
            const metaProperty = path.node;
            if (metaProperty.meta.name === 'import' && metaProperty.property.name === 'meta') {
              // We're specifically looking for instances of `import.meta` so ignore any other meta properties.
              path.replaceWithSourceString('process');
            }
          },
        },
      };
    },
  ],
};
