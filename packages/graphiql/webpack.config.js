import DotenvPlugin from 'dotenv-webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default (env, argv) => ({
  entry: './src/index.tsx',
  devtool: argv.mode === 'production' ? 'source-map' : 'eval-source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
  },
  module: {
    rules: [
      {
        test: /\.html$/,
        use: ['file?name=[name].[ext]'],
      },
      {
        type: 'javascript/auto',
        test: /\.mjs$/,
        use: [],
        include: /node_modules/,
      },
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: '/node_modules/',
        loader: 'babel-loader',
        resolve: {
          fullySpecified: false
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.svg$/,
        use: [{ loader: 'svg-inline-loader' }],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        use: ['file-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json', '.jsx', '.css', '.mjs', '.ts', '.tsx'],
  },
  plugins: [
    new DotenvPlugin({
      defaults: true,
      systemvars: true,
    }),
    new HtmlWebpackPlugin({
      template: 'src/index.html.ejs',
    }),
  ],
  devServer: {
    hot: true,
    // bypass simple localhost CORS restrictions by setting
    // these to 127.0.0.1 in /etc/hosts
    allowedHosts: ['local.test.com', 'graphiql.com'],
  },
  optimization: {
    usedExports: true,
    innerGraph: true,
    sideEffects: true,
  },
});
