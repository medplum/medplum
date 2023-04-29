import CopyWebpackPlugin from 'copy-webpack-plugin';
import dotenv from 'dotenv';
import DotenvPlugin from 'dotenv-webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import WorkboxPlugin from 'workbox-webpack-plugin';

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
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  plugins: [
    process.env.KEEP_ENV_VARS !== 'true' &&
      new DotenvPlugin({
        defaults: true,
        systemvars: true,
      }),
    new WebpackManifestPlugin({
      fileName: 'manifest.webmanifest',
      seed: {
        name: 'Medplum',
        short_name: 'Medplum',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/img/medplum-logo.svg',
            type: 'image/svg+xml',
            sizes: '512x512',
          },
          {
            src: '/img/medplum-logo-512x512.png',
            type: 'image/png',
            sizes: '512x512',
          },
          {
            src: '/img/medplum-logo-maskable.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'maskable',
          },
        ],
      },
    }),
    new HtmlWebpackPlugin({
      template: 'index.html.ejs',
      favicon: 'favicon.ico',
    }),
    new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash].css',
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'static',
        },
      ],
    }),
    argv.mode === 'production' &&
      new WorkboxPlugin.GenerateSW({
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      }),
  ].filter((p) => !!p),
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
