const path = require('path');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const DotenvPlugin = require('dotenv-webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { SubresourceIntegrityPlugin } = require('webpack-subresource-integrity');
const dotenv = require('dotenv');

dotenv.config();

module.exports = (env, argv) => ({
  entry: './src/index.tsx',
  devtool: argv.mode === 'production' ? 'source-map' : 'eval-source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[contenthash].js',
    publicPath: '/',
    crossOriginLoading: 'anonymous',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
    }),
    new DotenvPlugin({
      defaults: true,
      systemvars: true,
    }),
    new HtmlWebpackPlugin({
      template: 'index.html.ejs',
      favicon: 'favicon.ico',
      templateParameters: {
        RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY,
      },
    }),
    new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash].css',
    }),
    new SubresourceIntegrityPlugin(),
  ],
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: '/node_modules/',
        loader: 'babel-loader',
      },
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  devServer: {
    port: 3000,
    hot: true,
    devMiddleware: {
      index: true,
      publicPath: '/',
      writeToDisk: true,
    },
    historyApiFallback: {
      index: '/index.html',
    },
  },
  optimization: {
    usedExports: true,
    innerGraph: true,
    sideEffects: true,
    runtimeChunk: 'single',
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
});
