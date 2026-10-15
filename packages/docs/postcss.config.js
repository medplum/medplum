module.exports = {
  parser: 'postcss-scss',
  plugins: {
    'postcss-pxtorem': {
      rootValue: 16,
      propList: ['font', 'font-size', 'line-height', 'letter-spacing'],
      replace: true,
    },
  },
};
