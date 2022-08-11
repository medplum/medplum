import dotenv from 'dotenv';
import DotenvPlugin from 'dotenv-webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { SubresourceIntegrityPlugin } from 'webpack-subresource-integrity';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();

export default (env, argv) => ({
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
    new DotenvPlugin({
      defaults: true,
      systemvars: true,
    }),
    new HtmlWebpackPlugin({
      template: 'index.html.ejs',
      favicon: 'favicon.ico',
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
    providedExports: true,
    runtimeChunk: 'single',
  },
});
