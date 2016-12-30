// `CheckerPlugin` is optional. Use it if you want async error reporting.
// We need this plugin to detect a `--watch` mode. It may be removed later
// after https://github.com/webpack/webpack/issues/3460 will be resolved.
const webpack = require('webpack');

module.exports = {

  // Currently we need to add '.ts' to the resolve.extensions array.
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    // Ensure we get a standalone vue js build
    alias: {
      vue: 'vue/dist/vue.js'
    }
  },

  // Source maps support ('inline-source-map' also works)
  devtool: 'eval-source-map',

  entry: "./src/entry.ts",
  output: {
    filename: './dist/bundle.js'
  },

  // Add the loader for .ts files.
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'tslint-loader',
        enforce: 'pre',
      },
      {
        test: /\.ts$/,
        loader: 'awesome-typescript-loader',
      }
    ],
    // Prevent seedrandom from bringing in a million node dependencies
    // to polyfill a whole bunch of crypto.
    noParse: [/seedrandom.js/],
  },

  plugins: [
      new webpack.LoaderOptionsPlugin({
        options: {
            tslint: {
                emitErrors: false,
                failOnHint: false
            }
        }
    }),
    ...['seedrandom'].map(plugin=> new webpack.PrefetchPlugin(plugin)),
  ],

  // Disable performance hassle
  performance: { hints: false }

};